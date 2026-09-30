#!/usr/bin/env python3
"""
Print the macOS default output device's current hardware format as JSON.

Browsers can read the output sample rate (AudioContext.sampleRate) but never
the device's bit depth, so studio-vr's /audio-test dev tool asks
studio-backend (GET /audio-device, see audio-device.service.ts), which runs
this script. It talks to CoreAudio directly through ctypes (no
third-party packages) and reports the stream's *physical* format — the same
thing Audio MIDI Setup shows under "Format", e.g. "2ch 24-bit Integer 48.0 kHz".

Output: {"ok": true, "deviceName", "sampleRate", "bitDepth", "isFloat",
         "channels", "formatLabel"}  or  {"ok": false, "error": "..."}
"""

import ctypes
import json
import struct
import sys


def fourcc(s):
    return struct.unpack(">I", s.encode("ascii"))[0]


class PropertyAddress(ctypes.Structure):
    _fields_ = [
        ("mSelector", ctypes.c_uint32),
        ("mScope", ctypes.c_uint32),
        ("mElement", ctypes.c_uint32),
    ]


class StreamBasicDescription(ctypes.Structure):
    _fields_ = [
        ("mSampleRate", ctypes.c_double),
        ("mFormatID", ctypes.c_uint32),
        ("mFormatFlags", ctypes.c_uint32),
        ("mBytesPerPacket", ctypes.c_uint32),
        ("mFramesPerPacket", ctypes.c_uint32),
        ("mBytesPerFrame", ctypes.c_uint32),
        ("mChannelsPerFrame", ctypes.c_uint32),
        ("mBitsPerChannel", ctypes.c_uint32),
        ("mReserved", ctypes.c_uint32),
    ]


SYSTEM_OBJECT = 1
SCOPE_GLOBAL = fourcc("glob")
SCOPE_OUTPUT = fourcc("outp")
ELEMENT_MAIN = 0
DEFAULT_OUTPUT_DEVICE = fourcc("dOut")
NOMINAL_SAMPLE_RATE = fourcc("nsrt")
DEVICE_STREAMS = fourcc("stm#")
STREAM_PHYSICAL_FORMAT = fourcc("pft ")
OBJECT_NAME = fourcc("lnam")
FORMAT_LINEAR_PCM = fourcc("lpcm")
FLAG_IS_FLOAT = 1 << 0
CF_UTF8 = 0x08000100


def main():
    ca = ctypes.cdll.LoadLibrary(
        "/System/Library/Frameworks/CoreAudio.framework/CoreAudio"
    )
    cf = ctypes.cdll.LoadLibrary(
        "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation"
    )

    get_data = ca.AudioObjectGetPropertyData
    get_data.argtypes = [
        ctypes.c_uint32,
        ctypes.POINTER(PropertyAddress),
        ctypes.c_uint32,
        ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_uint32),
        ctypes.c_void_p,
    ]
    get_data.restype = ctypes.c_int32

    get_size = ca.AudioObjectGetPropertyDataSize
    get_size.argtypes = [
        ctypes.c_uint32,
        ctypes.POINTER(PropertyAddress),
        ctypes.c_uint32,
        ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_uint32),
    ]
    get_size.restype = ctypes.c_int32

    cf.CFStringGetCString.argtypes = [
        ctypes.c_void_p,
        ctypes.c_char_p,
        ctypes.c_long,
        ctypes.c_uint32,
    ]
    cf.CFStringGetCString.restype = ctypes.c_bool
    cf.CFRelease.argtypes = [ctypes.c_void_p]

    def read(obj, selector, scope, out):
        addr = PropertyAddress(selector, scope, ELEMENT_MAIN)
        size = ctypes.c_uint32(ctypes.sizeof(out))
        status = get_data(obj, ctypes.byref(addr), 0, None, ctypes.byref(size), ctypes.byref(out))
        if status != 0:
            raise RuntimeError(f"CoreAudio error {status} reading {selector:#x}")
        return out

    # Default output device
    device = read(SYSTEM_OBJECT, DEFAULT_OUTPUT_DEVICE, SCOPE_GLOBAL, ctypes.c_uint32()).value
    if device == 0:
        raise RuntimeError("No default output device")

    # Device name (CFStringRef)
    name = None
    try:
        ref = read(device, OBJECT_NAME, SCOPE_GLOBAL, ctypes.c_void_p())
        if ref.value:
            buf = ctypes.create_string_buffer(512)
            if cf.CFStringGetCString(ref, buf, 512, CF_UTF8):
                name = buf.value.decode("utf-8", "replace")
            cf.CFRelease(ref)
    except RuntimeError:
        pass

    nominal = read(device, NOMINAL_SAMPLE_RATE, SCOPE_GLOBAL, ctypes.c_double()).value

    # First output stream → its physical (hardware) format
    addr = PropertyAddress(DEVICE_STREAMS, SCOPE_OUTPUT, ELEMENT_MAIN)
    size = ctypes.c_uint32(0)
    if get_size(device, ctypes.byref(addr), 0, None, ctypes.byref(size)) != 0 or size.value < 4:
        raise RuntimeError("Output device has no output streams")
    count = size.value // 4
    streams = (ctypes.c_uint32 * count)()
    if get_data(device, ctypes.byref(addr), 0, None, ctypes.byref(size), streams) != 0:
        raise RuntimeError("Could not list output streams")

    fmt = read(streams[0], STREAM_PHYSICAL_FORMAT, SCOPE_GLOBAL, StreamBasicDescription())

    is_pcm = fmt.mFormatID == FORMAT_LINEAR_PCM
    is_float = bool(fmt.mFormatFlags & FLAG_IS_FLOAT)
    bits = int(fmt.mBitsPerChannel)
    rate = fmt.mSampleRate or nominal
    if is_pcm:
        label = f"{bits}-bit {'Float' if is_float else 'Integer'}"
    else:
        label = struct.pack(">I", fmt.mFormatID).decode("ascii", "replace")

    print(
        json.dumps(
            {
                "ok": True,
                "deviceName": name,
                "sampleRate": rate,
                "nominalSampleRate": nominal,
                "bitDepth": bits if is_pcm else None,
                "isFloat": is_float,
                "channels": int(fmt.mChannelsPerFrame),
                "formatLabel": label,
            }
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # report, don't crash the API request
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(0)
