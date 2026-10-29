"""Measure rendered support toe motion from the DEV review trace, not artist estimates."""
import json
import sys
from pathlib import Path

trace = json.loads(Path(sys.argv[1]).read_text())
results = []
for case, spec in enumerate(trace['cases']):
    rows = [r for r in trace['rows'] if r['case'] == case]
    hits = [r for a, r in zip(rows, rows[1:]) if r['hp2'] < a['hp2']]
    segments, current, key = [], [], None
    transitions, held = [], []
    for row in rows:
        s = row['support']
        if not s:
            if current: segments.append(current)
            current, key = [], None
            continue
        k = (row['tick'] >= 175, row['sample']['tick'] // 43, s['leg'])
        if key != k:
            if current: segments.append(current)
            current, key = [], k
        if current:
            p = current[-1]
            delta = s['worldToe'] - p['support']['worldToe']
            (held if s['frame'] == p['support']['frame'] else transitions).append(delta)
        current.append(row)
    if current: segments.append(current)
    full = [s for s in segments if len({r['support']['frame'] for r in s}) == 4]
    results.append({'case': spec['name'], 'damageEvents': [{'tick': r['tick'], 'attackTick': r['attackTick'], 'artFrame': r['sample']['frame'], 'hp2': r['hp2']} for r in hits],
        'fullSupportSegments': len(full),
        'fullSupportWorldToePeakToPeakPx': [{'startTick': s[0]['tick'], 'rootDeltaPx': s[-1]['x'] - s[0]['x'], 'expectedFreeDeltaAbsPx': (len(s) - 1) * 6,
            'free': all(abs(abs(b['x'] - a['x']) - 6) < .001 for a, b in zip(s, s[1:])),
            'rangePx': max(r['support']['worldToe'] for r in s) - min(r['support']['worldToe'] for r in s)} for s in full],
        'supportVerticalErrorGamePx': sorted(set(r['support']['groundErrorGamePx'] for r in rows if r['support'])),
        'heldFrameToeDeltaPx': sorted(set(held)), 'frameSwapToeDeltaPx': sorted(set(transitions)),
        'endHealth2': rows[-1]['hp2']})
print(json.dumps(results, ensure_ascii=False, indent=2))
