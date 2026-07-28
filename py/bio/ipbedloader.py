from ion import works
from subprocess import Popen, PIPE
import json

file = works.param(1)
chrom = works.param(2)
startIndex = works.param(3)
endIndex = works.param(4)
strand = works.param(5)

print(f'file {file}')
print(f'chrom {chrom}')
print(f'start {startIndex}')
print(f'end {endIndex}')
print(f'strand {strand}')


def parse_attributes(attr_text):
    attrs = {}
    if not attr_text:
        return attrs

    for part in attr_text.strip().split(';'):
        if '=' in part:
            key, value = part.split('=', 1)
            attrs[key.strip()] = value.strip()
    return attrs


def parse_row(row):
    d = {
        'chromosome': row[0],
        'start': int(row[1]),
        'end': int(row[2]),
        'name': row[3],
        'score': row[4],
        'strand': row[5],
    }

    if len(row) > 6:
        d['ra'] = row[6]

    if len(row) > 7:
        d['rl'] = row[7]

    if len(row) > 8:
        d['dt'] = row[8]

    return d


def tabix_query(filename, chrom, start, end):
    query = '{}:{}-{}'.format(chrom, start, end)
    process = Popen(['tabix', '-f', filename, query], stdout=PIPE)

    for line in process.stdout:
        yield line.decode('utf-8').strip().split('\t')


def dedupe_records(records):
    seen = set()
    distinct = []

    for rec in records:
        attrs = parse_attributes(rec.get('ra', ''))

        key = (
            rec.get('chromosome'),
            rec.get('start'),
            rec.get('end'),
            rec.get('strand'),
            attrs.get('applicant', ''),
            attrs.get('year', '')
        )

        if key not in seen:
            seen.add(key)
            distinct.append(rec)

    return distinct


records = tabix_query(file, chrom, int(startIndex), int(endIndex))
parsed = [parse_row(row) for row in records]

# only filter if strand is actually meaningful
if strand in ('+', '-'):
    parsed = [r for r in parsed if r.get('strand') == strand]

bp = dedupe_records(parsed)

works.resolve({'results': bp})