# Phase B4-D — Delegated Decision Report

## Global policy decision
- Decision: **ACCEPT_GLOBAL_POLICY** (signed copy: `signed-decisions/GLOBAL_POLICY_DECISION.signed.md`)
- Reviewer: Project owner — delegated policy approval
- Review date: 2026-08-04
- Decision origin: owner_delegated_policy
- Historical verification: false
- Covered events: 61 (global fail-closed pack)

## Per-event decisions
- Decision rows signed: 88
- Counts:
  - ACCEPT_POLICY: 23
  - DISABLE_GEOMETRY: 33
  - SET_MULTI_POINT: 19
  - SET_POINT: 13
- Status counts:
  - owner_approved_correction: 32
  - owner_approved_no_geometry: 33
  - owner_policy_approved: 23

## High-risk decisions
- Kowloon event (hoi-nghi-thanh-lap-dang-cong-san-viet-nam): ACCEPT_POLICY, no_location (outside Vietnam overview boundary).
- Bạch Đằng 938 (chien-thang-bach-dang-938): SET_POINT with the existing Bạch Đằng marker; 3D battle module is separate.
- Island/border/transnational: geometry disabled where policy candidate had geometry and no official external evidence was confirmed this round; fail-closed no_location elsewhere.
- Suspicious multi-point: kept as multi_point only for high-confidence distinct named localities after dedup; otherwise disabled.

## Decision algorithm (deterministic)
1. P0 explicit directives (§6.1, §6.2) take precedence.
2. island/border/transnational: ACCEPT_POLICY when already no_location; DISABLE_GEOMETRY when geometry exists without confirmed official evidence.
3. B_duplicate_only_one_distinct: SET_POINT when the single distinct marker is high confidence (>=0.7) named locality, not an admin centroid; else DISABLE_GEOMETRY.
4. B_duplicate_coordinates: SET_MULTI_POINT after dedup when >=2 distinct high-confidence markers and no D_insufficient_marker_provenance; else DISABLE_GEOMETRY.
5. No NEED_MORE_EVIDENCE rows remain; fail-closed representation is always available.
