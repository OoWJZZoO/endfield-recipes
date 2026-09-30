#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
Endfield 游戏操控 — MaaEnd (MXU) 本地 HTTP API，供 agent 使用。

取帧走 MaaEnd（Win32-Front / ScreenDC），全屏、窗口化都正常。ZCode Computer Use
对终末地窗口抓屏始终 invalid_target（反作弊/图形保护挡窗口级捕获），不能用。
MaaEnd 的 HTTP 层只暴露了 click 一个输入端点——实测判据：对其余 16 个候选输入路径
（swipe/touch*/scroll/wheel/key/press_key/input_text/drag/move_mouse/screencap/...）
GET 全部 200 text/html = SPA 回落 = 路由不存在；唯 click 返回 405 = 路由存在且
POST-only。所以输入只有点击，没有拖动/滚轮/按键。

用法（无参数 = 打印本帮助）:
  python endfield.py state                       实例 id、连接状态、游戏窗口句柄
  python endfield.py shot [OUT.png]              取当前帧，默认 shots/latest.png
  python endfield.py click X Y                   MaaEnd 点击（帧坐标）
  python endfield.py clickshot X Y [OUT.png]     点击 -> 等待 -> 取帧（动作+观察一步完成）
  python endfield.py wait-change [SEC] [OUT.png] 轮询直到画面和上一帧不同（确认 UI 切换完成）
  python endfield.py roi X Y W H OUT.png         从最近一帧裁剪放大局部（看小字/精确定位）
  python endfield.py subscribe|unsubscribe       手动控制截图流

输出统一为 KEY=VALUE 行，方便回读。退出码 0 成功，2 为环境/参数问题。

重要约定:
  * click 的坐标是「截图帧」里的像素，不是屏幕坐标。每次 shot 打印 WXH；
    分辨率一变（全屏/窗口化、改渲染分辨率）旧坐标一律作废，必须重新取帧定位。
    实测全屏和窗口化下帧都是 1280x720（游戏 720p 渲染），但脚本不硬编码。
  * /screenshot 返回后端「缓存帧」，缓存只在截图流运行时刷新。所以 shot 前总是重发
    subscribe（幂等，subscriber_id=agent-cli, 400ms），并且只在「停->跑」切换那一刻
    等 0.6s（一个采集周期）再取——之后帧一直是新的。订阅故意保留不退。

依赖: 仅 Python 标准库 + Pillow（roi 用）。BASE 可用环境变量 MAAEND_BASE 覆盖。
"""
import hashlib
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = os.environ.get("MAAEND_BASE", "http://127.0.0.1:12701/api").rstrip("/")
SUBSCRIBER = "agent-cli"
INTERVAL_MS = 400
WARMUP_S = INTERVAL_MS / 1000.0 + 0.2   # 订阅生效后等一个采集周期再取帧
SCRIPT_DIR = Path(__file__).resolve().parent
SHOT_DIR = SCRIPT_DIR / "shots"
STATE_FILE = SCRIPT_DIR / ".endfield-state.json"
DEFAULT_SHOT = SHOT_DIR / "latest.png"


class ApiError(Exception):
    pass


# ------------------------------------------------------------------ HTTP

def _req(method, path, body=None, timeout=15):
    url = BASE + path
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read(), r.headers.get("content-type", "")
    except urllib.error.HTTPError as e:
        raise ApiError("HTTP %s %s%s -> %s" % (e.code, method, path, e.read()[:200]))
    except urllib.error.URLError as e:
        raise ApiError("MaaEnd API 不可达 %s (%s)。MXU 服务起了吗？" % (BASE, e.reason))


def _get_json(path):
    payload, _ = _req("GET", path)
    return json.loads(payload.decode("utf-8"))


def _post_json(path, body):
    payload, _ = _req("POST", path, body=body)
    try:
        return json.loads(payload.decode("utf-8"))
    except ValueError:
        return {"raw": payload[:200].decode("utf-8", "replace")}


# ------------------------------------------------------------------ 状态

def load_state():
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except ValueError:
            pass
    return {}


def save_state(st):
    STATE_FILE.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")


def get_instance():
    """返回 (instance_id, instance_state, win32_windows)。"""
    st = _get_json("/maa/state")
    instances = st.get("instances") or {}
    if not instances:
        raise ApiError("MaaEnd 里没有已创建的实例。先在 MXU 界面里建一个并连接。")
    inst_id = None
    for k, v in instances.items():
        if v.get("connected"):
            inst_id = k
            break
    if inst_id is None:
        inst_id = sorted(instances.keys())[0]
    return inst_id, instances[inst_id], st.get("cached_win32_windows") or []


def ensure_subscribed_for(inst_id):
    """保证截图流在跑。返回 True 表示这次调用发生了「停->跑」切换。"""
    st = load_state()
    was = bool(st.get("subscribed")) and st.get("subscribed_instance") == inst_id
    _post_json("/maa/instances/%s/screenshot/subscribe" % inst_id,
               {"subscriber_id": SUBSCRIBER, "interval_ms": INTERVAL_MS})
    st["subscribed"] = True
    st["subscribed_instance"] = inst_id
    save_state(st)
    return not was


def png_size(data):
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ApiError("返回内容不是 PNG（len=%d, head=%r）" % (len(data), data[:16]))
    w, h = struct.unpack(">II", data[16:24])
    return w, h


def grab_frame(inst_id, out_path):
    """确保订阅在 -> 取帧落盘。返回描述 dict。"""
    if ensure_subscribed_for(inst_id):
        time.sleep(WARMUP_S)          # 缓存帧要等一个采集周期才会刷新
    payload, ctype = _req("GET", "/maa/instances/%s/screenshot" % inst_id, timeout=20)
    w, h = png_size(payload)
    digest = hashlib.md5(payload).hexdigest()
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(payload)

    st = load_state()
    same = (st.get("last_hash") == digest)
    st.update({"instance_id": inst_id, "subscribed": True,
               "subscribed_instance": inst_id, "last_hash": digest,
               "last_shot_path": str(out_path), "last_size": [w, h]})
    save_state(st)
    return {"PATH": str(out_path), "WXH": "%dx%d" % (w, h), "BYTES": len(payload),
            "MD5": digest[:12], "SAME_AS_PREV": "true" if same else "false",
            "CTYPE": ctype}


def emit(d):
    for k, v in d.items():
        print("%s=%s" % (k, v))


# ------------------------------------------------------------------ 命令
# 统一签名 (args: list[str])，分发器一律传 args。

def cmd_state(args):
    inst_id, inst, windows = get_instance()
    emit({
        "INSTANCE": inst_id,
        "CONNECTED": "true" if inst.get("connected") else "false",
        "IS_RUNNING": "true" if inst.get("is_running") else "false",
        "RESOURCE_LOADED": "true" if inst.get("resource_loaded") else "false",
        "TASKER_INITED": "true" if inst.get("tasker_inited") else "false",
        "WIN32_WINDOWS": ";".join(
            "%s/%s/hwnd=%s" % (w.get("window_name"), w.get("class_name"), w.get("handle"))
            for w in windows) or "(none)",
        "BASE": BASE,
    })
    return 0


def cmd_shot(args):
    inst_id, _, _ = get_instance()
    out = Path(args[0]) if args else DEFAULT_SHOT
    emit(grab_frame(inst_id, out))
    return 0


def cmd_click(args):
    inst_id, _, _ = get_instance()
    x, y = int(args[0]), int(args[1])
    res = _post_json("/maa/instances/%s/click" % inst_id, {"x": x, "y": y})
    emit({"CLICKED": "%d,%d" % (x, y), "CLICK_ID": res.get("clickId", res.get("raw", "?"))})
    return 0


def cmd_clickshot(args):
    wait_ms = 1500
    pos, out = [], None
    i = 0
    while i < len(args):
        if args[i] == "--wait":
            wait_ms = int(args[i + 1]); i += 2; continue
        if len(pos) < 2:
            pos.append(int(args[i])); i += 1; continue
        out = Path(args[i]); i += 1
    inst_id, _, _ = get_instance()
    x, y = pos
    res = _post_json("/maa/instances/%s/click" % inst_id, {"x": x, "y": y})
    time.sleep(wait_ms / 1000.0)
    frame = grab_frame(inst_id, out or DEFAULT_SHOT)
    frame.update({"CLICKED": "%d,%d" % (x, y),
                  "CLICK_ID": res.get("clickId", res.get("raw", "?")),
                  "WAIT_MS": wait_ms})
    emit(frame)
    return 0


def cmd_wait_change(args):
    timeout = float(args[0]) if args else 8.0
    out = Path(args[1]) if len(args) > 1 else DEFAULT_SHOT
    inst_id, _, _ = get_instance()
    st = load_state()
    baseline = st.get("last_hash")
    deadline = time.time() + timeout
    last_err = None
    while time.time() < deadline:
        try:
            payload, _ = _req("GET", "/maa/instances/%s/screenshot" % inst_id, timeout=10)
            digest = hashlib.md5(payload).hexdigest()
            if digest != baseline:
                w, h = png_size(payload)
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(payload)
                st.update({"instance_id": inst_id, "subscribed": True,
                           "subscribed_instance": inst_id, "last_hash": digest,
                           "last_shot_path": str(out), "last_size": [w, h]})
                save_state(st)
                emit({"CHANGED": "true", "PATH": str(out), "WXH": "%dx%d" % (w, h),
                      "BYTES": len(payload), "MD5": digest[:12],
                      "WAITED_S": round(timeout - (deadline - time.time()), 2)})
                return 0
        except ApiError as e:
            last_err = e
        time.sleep(0.35)
    sys.stderr.write("WARN %ss 内画面未变化%s\n" % (timeout, ("，最后错误: %s" % last_err) if last_err else ""))
    emit({"CHANGED": "false", "TIMEOUT_S": timeout})
    return 0


def cmd_roi(args):
    x, y, w, h = (int(v) for v in args[:4])
    out = Path(args[4])
    src = None
    if "--src" in args:
        src = Path(args[args.index("--src") + 1])
    if src is None:
        st = load_state()
        src = st.get("last_shot_path") or str(DEFAULT_SHOT)
    src = Path(src)
    if not src.exists():
        print("源帧不存在: %s（先跑一次 shot）" % src, file=sys.stderr)
        return 2
    from PIL import Image  # 延迟导入，只有 roi 用
    im = Image.open(src)
    box = (max(0, x), max(0, y), min(im.width, x + w), min(im.height, y + h))
    crop = im.crop(box)
    scale = max(2, int(900 / max(1, crop.width)))
    if scale > 1 and crop.width * scale <= 3000:
        crop = crop.resize((crop.width * scale, crop.height * scale))
    out.parent.mkdir(parents=True, exist_ok=True)
    crop.save(out)
    emit({"PATH": str(out), "SRC": str(src), "BOX": "%d,%d,%d,%d" % box,
          "OUT_SIZE": "%dx%d" % crop.size, "SCALE": scale})
    return 0


def cmd_subscribe(args):
    inst_id, _, _ = get_instance()
    _post_json("/maa/instances/%s/screenshot/subscribe" % inst_id,
               {"subscriber_id": SUBSCRIBER, "interval_ms": INTERVAL_MS})
    st = load_state()
    st["subscribed"] = True
    st["subscribed_instance"] = inst_id
    save_state(st)
    emit({"SUBSCRIBED": inst_id, "SUBSCRIBER": SUBSCRIBER, "INTERVAL_MS": INTERVAL_MS})
    return 0


def cmd_unsubscribe(args):
    inst_id, _, _ = get_instance()
    _post_json("/maa/instances/%s/screenshot/unsubscribe" % inst_id,
               {"subscriber_id": SUBSCRIBER})
    st = load_state()
    st["subscribed"] = False
    save_state(st)
    emit({"UNSUBSCRIBED": inst_id, "SUBSCRIBER": SUBSCRIBER})
    return 0


COMMANDS = {
    "state": (cmd_state, 0, 0),
    "shot": (cmd_shot, 0, 1),
    "click": (cmd_click, 2, 2),
    "clickshot": (cmd_clickshot, 2, 5),
    "wait-change": (cmd_wait_change, 0, 2),
    "roi": (cmd_roi, 5, 7),
    "subscribe": (cmd_subscribe, 0, 0),
    "unsubscribe": (cmd_unsubscribe, 0, 0),
}


def main(argv):
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(__doc__)
        return 0
    cmd, rest = argv[0], argv[1:]
    if cmd not in COMMANDS:
        print("未知命令: %s\n\n%s" % (cmd, __doc__), file=sys.stderr)
        return 2
    fn, lo, hi = COMMANDS[cmd]
    if not (lo <= len(rest) <= hi):
        print("参数数量不对: %s 需要 %d~%d 个，收到 %d 个\n\n%s" % (cmd, lo, hi, len(rest), __doc__),
              file=sys.stderr)
        return 2
    try:
        return fn(rest)
    except ApiError as e:
        print("ERROR %s" % e, file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
