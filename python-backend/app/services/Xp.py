"""
XP and levelling — exponential curve.

Level 1→2:    500 XP needed
Level 2→3:  1,500 XP needed  (total: 2,000)
Level 3→4:  3,000 XP needed  (total: 5,000)
Level 4→5:  5,000 XP needed  (total: 10,000)
...each gap grows so higher levels take much longer
"""

LEVEL_THRESHOLDS = [
    0,       # reach Level 1
    500,     # reach Level 2
    2000,    # reach Level 3
    5000,    # reach Level 4
    10000,   # reach Level 5
    17500,   # reach Level 6
    28000,   # reach Level 7
    42000,   # reach Level 8
    60000,   # reach Level 9
    82500,   # reach Level 10
    110000,  # reach Level 11
    142500,  # reach Level 12
    180000,  # reach Level 13
    222500,  # reach Level 14
    270000,  # reach Level 15 (max)
]

LEVEL_TITLES = {
    1:  "Broke Beginner",
    2:  "Budget Tracker",
    3:  "Saving Starter",
    4:  "Penny Pincher",
    5:  "Cash Conscious",
    6:  "Finance Aware",
    7:  "Money Manager",
    8:  "Wealth Builder",
    9:  "Investment Initiate",
    10: "Market Watcher",
    11: "Portfolio Pro",
    12: "Finance Commander",
    13: "Wealth Strategist",
    14: "Capital Master",
    15: "Solo Level MAX",
}


def calc_level(xp: int) -> int:
    level = 1
    for i, threshold in enumerate(LEVEL_THRESHOLDS):
        if xp >= threshold:
            level = i + 1
        else:
            break
    return min(level, len(LEVEL_THRESHOLDS))


def xp_progress(xp: int, current_level: int) -> dict:
    idx = current_level - 1
    current_threshold = LEVEL_THRESHOLDS[idx] if idx < len(LEVEL_THRESHOLDS) else 0
    next_threshold = LEVEL_THRESHOLDS[idx + 1] if idx + 1 < len(LEVEL_THRESHOLDS) else LEVEL_THRESHOLDS[-1]
    level_xp = xp - current_threshold
    level_range = next_threshold - current_threshold
    pct = round((level_xp / level_range) * 100, 1) if level_range > 0 else 100.0
    return {
        "current_xp": xp,
        "level": current_level,
        "title": LEVEL_TITLES.get(current_level, "Legend"),
        "xp_into_level": level_xp,
        "xp_needed_for_next": level_range,
        "next_level_total": next_threshold,
        "progress_pct": min(pct, 100.0),
    }