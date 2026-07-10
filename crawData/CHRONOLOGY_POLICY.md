# Chronology Policy

This repository uses explicit, manually reviewed chronology repairs. The policy
layer does not parse `displayDate` text and does not infer chronology from event
IDs or the current calendar year.

## `closed_historical_period_v1`

`closed_historical_period_v1` represents deterministic approximate sortable
bounds for semantically closed historical periods. It is valid only for manually
curated records whose complete chronology object matches the declared structured
policy specification.

All policy-backed chronology must use:

- `datePrecision`: `period`
- `isApproximate`: `true`
- null `month` and `day`
- explicit `start.year` and `end.year`

## Year Numbering

BCE years are negative integers. Year zero is forbidden. The sequence around the
era boundary is:

```text
... -2, -1, 1, 2 ...
```

## Centuries

For century `N` CE:

```text
start = 100 x (N - 1) + 1
end   = 100 x N
```

For century `N` BCE:

```text
start = -(100 x N)
end   = -(100 x (N - 1) + 1)
```

Century indexes must be positive.

## Early, Middle, Late

A 100-year century is partitioned by ordinal positions:

```text
early:  positions 1-33
middle: positions 34-66
late:   positions 67-100
```

The same chronological ordering applies to BCE centuries.

## Millennia

For millennium `N` CE:

```text
start = 1000 x (N - 1) + 1
end   = 1000 x N
```

For millennium `N` BCE:

```text
start = -(1000 x N)
end   = -(1000 x (N - 1) + 1)
```

A 1000-year millennium is partitioned by ordinal positions:

```text
early:  positions 1-333
middle: positions 334-666
late:   positions 667-1000
```

## Decades

An explicit curated decade uses an absolute anchor year divisible by 10:

```text
1930s -> 1930-1939
```

The policy does not infer decades from prose.

## Unsupported Semantics

`closed_historical_period_v1` rejects:

- open start or open end boundaries
- `before X`, `after X`, and `X to present`
- dynamic current-year end dates
- multiple disjoint intervals
- relative `N years ago` expressions
- BCE-to-CE ranges

These require either null machine chronology, hierarchy/display handling, or a
future structured chronology model.
