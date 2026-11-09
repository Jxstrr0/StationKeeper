"""Repack an exported .glb smaller: drop what the game doesn't read and store the rest in fewer bytes.

Blender writes every attribute as 32-bit floats and gives every primitive UVs. Here normals become normalised
16-bit ints (KHR_mesh_quantization), colours 8-bit, and UVs are kept only on materials that carry a tiling texture.
Roughly halves the files. No geometry is changed.
"""
import json
import struct

import numpy as np

from .geo import TILE

DTYPE = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def repack(path):
    with open(path, 'rb') as f:
        data = f.read()
    json_len = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + json_len])
    bin_start = 20 + json_len + 8
    blob = data[bin_start:]

    def read(index):
        acc = doc['accessors'][index]
        view = doc['bufferViews'][acc['bufferView']]
        dtype = np.dtype(DTYPE[acc['componentType']])
        width = WIDTH[acc['type']]
        start = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
        stride = view.get('byteStride', dtype.itemsize * width)
        raw = np.frombuffer(blob, dtype=np.uint8, count=stride * (acc['count'] - 1) + dtype.itemsize * width, offset=start)
        if stride == dtype.itemsize * width:
            arr = raw.view(dtype).reshape(acc['count'], width)
        else:
            arr = np.stack([raw[i * stride:i * stride + dtype.itemsize * width].view(dtype) for i in range(acc['count'])])
        if acc.get('normalized'):
            arr = arr.astype(np.float32) / np.iinfo(dtype).max
        return arr

    out = bytearray()
    views, accessors = [], []

    def write(arr, component, kind, target, normalized=False, bounds=False):
        while len(out) % 4:
            out.append(0)
        raw = np.ascontiguousarray(arr).tobytes()
        views.append({'buffer': 0, 'byteOffset': len(out), 'byteLength': len(raw), 'target': target})
        out.extend(raw)
        acc = {'bufferView': len(views) - 1, 'componentType': component, 'count': len(arr), 'type': kind}
        if normalized:
            acc['normalized'] = True
        if bounds:
            acc['min'] = [float(x) for x in arr.min(axis=0)]
            acc['max'] = [float(x) for x in arr.max(axis=0)]
        accessors.append(acc)
        return len(accessors) - 1

    quantized = False
    for mesh in doc['meshes']:
        for prim in mesh['primitives']:
            name = doc['materials'][prim['material']]['name']
            attrs = prim['attributes']
            new = {'POSITION': write(read(attrs['POSITION']).astype(np.float32), 5126, 'VEC3', 34962, bounds=True)}
            if 'NORMAL' in attrs:
                n = read(attrs['NORMAL']).astype(np.float64)
                n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
                packed = np.zeros((len(n), 4), dtype=np.int16)
                packed[:, :3] = np.round(n * 32767)
                # Three bytes of padding would break 4-byte alignment; a VEC3 in an 8-byte stride keeps it legal.
                while len(out) % 4:
                    out.append(0)
                raw = packed.tobytes()
                views.append({'buffer': 0, 'byteOffset': len(out), 'byteLength': len(raw), 'byteStride': 8, 'target': 34962})
                out.extend(raw)
                accessors.append({'bufferView': len(views) - 1, 'componentType': 5122, 'count': len(n), 'type': 'VEC3', 'normalized': True})
                new['NORMAL'] = len(accessors) - 1
                quantized = True
            if 'TEXCOORD_0' in attrs and name in TILE:
                new['TEXCOORD_0'] = write(read(attrs['TEXCOORD_0']).astype(np.float32), 5126, 'VEC2', 34962)
            if 'COLOR_0' in attrs:
                c = read(attrs['COLOR_0'])
                rgba = np.full((len(c), 4), 255, dtype=np.uint8)
                rgba[:, :3] = np.round(np.clip(c[:, :3], 0, 1) * 255)
                new['COLOR_0'] = write(rgba, 5121, 'VEC4', 34962, normalized=True)
            idx = read(prim['indices']).reshape(-1)
            if idx.max() < 65536:
                prim['indices'] = write(idx.astype(np.uint16).reshape(-1, 1), 5123, 'SCALAR', 34963)
            else:
                prim['indices'] = write(idx.astype(np.uint32).reshape(-1, 1), 5125, 'SCALAR', 34963)
            prim['attributes'] = new

    while len(out) % 4:
        out.append(0)
    doc['accessors'] = accessors
    doc['bufferViews'] = views
    doc['buffers'] = [{'byteLength': len(out)}]
    if quantized:
        doc['extensionsUsed'] = sorted(set(doc.get('extensionsUsed', [])) | {'KHR_mesh_quantization'})
        doc['extensionsRequired'] = sorted(set(doc.get('extensionsRequired', [])) | {'KHR_mesh_quantization'})
    doc['asset'] = {'version': '2.0', 'generator': 'Station Keeper tools/blender'}
    text = json.dumps(doc, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    total = 12 + 8 + len(text) + 8 + len(out)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(text), 0x4E4F534A))
        f.write(text)
        f.write(struct.pack('<II', len(out), 0x004E4942))
        f.write(out)
    return total
