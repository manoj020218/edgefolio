#!/usr/bin/env python3
"""
ZK Teco Attendance Pull Script for EDGEFOLIO
Connects to a ZK Teco (or compatible) device over the network and
pulls attendance logs, then outputs them as JSON for the Node.js backend.

Install dependency:  pip install pyzk
Supported devices:   ZK100, ZK200, ZK300, F18, F22, K40, K20, MA300,
                     MB10, iClock series, and most ZKSoftware devices.

Usage:
  python zkteco_pull.py <ip> [--port 4370] [--password 0]
                              [--from 2024-04-01] [--to 2024-04-30]
                              [--test]
"""
import json
import sys
import argparse
from datetime import datetime


def main():
    parser = argparse.ArgumentParser(description='Pull attendance from ZK Teco device')
    parser.add_argument('ip',           help='Machine IP address')
    parser.add_argument('--port',       type=int, default=4370,  help='TCP port (default 4370)')
    parser.add_argument('--password',   type=int, default=0,     help='Device password (default 0)')
    parser.add_argument('--from',       dest='from_date', default=None, help='Filter from YYYY-MM-DD')
    parser.add_argument('--to',         dest='to_date',   default=None, help='Filter to YYYY-MM-DD')
    parser.add_argument('--test',       action='store_true',  help='Only test connection, no data pull')
    args = parser.parse_args()

    # ── Check pyzk is installed ──────────────────────────────────────────────
    try:
        from zk import ZK
    except ImportError:
        _fail('pyzk library not installed.\n'
              'Install it with:  pip install pyzk\n'
              'Then retry the connection.')

    from_dt = _parse_date(args.from_date)
    to_dt   = _parse_date(args.to_date)

    zk = ZK(args.ip, port=args.port, timeout=15,
            password=args.password, ommit_ping=True)
    conn = None
    try:
        conn = zk.connect()

        if args.test:
            info = conn.get_firmware_version()
            print(json.dumps({'ok': True, 'test': True,
                              'firmware': str(info),
                              'message': f'Connected to {args.ip}:{args.port}'}))
            return

        conn.disable_device()
        attendances = conn.get_attendance()

        # ── Group punches into check-in / check-out pairs ────────────────────
        grouped = {}
        for a in attendances:
            dt = a.timestamp
            if from_dt and dt.date() < from_dt: continue
            if to_dt   and dt.date() > to_dt:   continue

            key = f'{a.user_id}_{dt.strftime("%Y-%m-%d")}'
            if key not in grouped:
                grouped[key] = {
                    'memberId': str(a.user_id),
                    'date':     dt.strftime('%Y-%m-%d'),
                    'punches':  [],
                }
            grouped[key]['punches'].append(dt.strftime('%H:%M'))

        records = []
        for g in grouped.values():
            punches = sorted(set(g['punches']))
            records.append({
                'memberId': g['memberId'],
                'date':     g['date'],
                'checkIn':  punches[0]  if punches else None,
                'checkOut': punches[-1] if len(punches) > 1 else None,
            })

        records.sort(key=lambda r: (r['date'], r['memberId']))
        print(json.dumps({'ok': True, 'records': records, 'total': len(records)}))

    except Exception as e:
        _fail(str(e))
    finally:
        if conn:
            try:
                conn.enable_device()
                conn.disconnect()
            except Exception:
                pass


def _parse_date(s):
    if not s:
        return None
    try:
        return datetime.strptime(s, '%Y-%m-%d').date()
    except ValueError:
        return None


def _fail(msg):
    print(json.dumps({'ok': False, 'error': msg}))
    sys.exit(1)


if __name__ == '__main__':
    main()
