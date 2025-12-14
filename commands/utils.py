# filename: thoughtbubble/commands/command_utils.py or just utils.py
# (Keeping filename as utils.py based on previous context)

import re


def parse_weight(weight_str):
    """Parses a weight string (0-1 float or simple integer)"""
    try:
        weight_str = weight_str.strip()
        if "." in weight_str:
            return float(weight_str)
        return float(weight_str) / 100.0
    except ValueError:
        return 0.0


def parse_weighted_option(text):
    """
    Parses "text:weight" -> (text, weight_val).
    Default weight is 1.
    Handles paths/text with colons correctly by splitting from the right.
    """
    content = text
    weight = 1.0  # Default to float 1.0, callers can cast to int if needed

    if ":" in text:
        try:
            c, w_str = text.rsplit(":", 1)
            val = float(w_str.strip())
            content = c
            weight = val
        except ValueError:
            pass

    return content, max(0.0, weight)


def fetch_list_source(parser, key):
    """
    Checks all data sources for a list-like entity matching 'key'.
    Returns a list of strings (lines) if found, or None.
    Sources checked: Wildcards -> Boxes -> Control Vars -> Dynamic Vars
    """
    key = key.lower().strip()

    # 1. Wildcards
    if key in parser.wildcards:
        return parser.wildcards[key]

    # 2. Text Boxes
    if key in parser.box_map:
        return [l for l in parser.box_map[key].split("\n") if l.strip()]

    # 3. Control Variables (Node Inputs)
    if key in parser.control_vars_by_name:
        val = str(parser.control_vars_by_name[key])
        return [l for l in val.split("\n") if l.strip()]

    # 4. Dynamic Variables (v_set)
    if key in parser.variables:
        val = str(parser.variables[key])
        return [l for l in val.split("\n") if l.strip()]

    return None


def check_condition(parser, condition_str, context):
    """
    Evaluates a condition string. Returns True if:
    1. It matches a truthy variable.
    2. The words are found in the context (weighted check).
    3. The string itself is truthy (e.g. "1", "true").
    """
    condition_str = condition_str.strip()
    if not condition_str:
        return False

    # 1. Variable Check
    var_name = condition_str.lower()
    if var_name in parser.variables:
        val = parser.variables[var_name]
        if val and val != "0" and val.lower() != "false":
            return True

    # 2. Context / Weight Check
    context_lower = context.lower()
    total_weight = 0.0
    has_match_attempt = False

    conditions = condition_str.split(",")
    for cond in conditions:
        cond = cond.strip()
        if not cond:
            continue

        word = cond
        weight_str = "1.0"

        if ":" in cond:
            try:
                word, weight_str = cond.rsplit(":", 1)
            except ValueError:
                word = cond

        word = word.strip().lower()
        if not word:
            continue

        has_match_attempt = True
        if re.search(r"\b" + re.escape(word) + r"\b", context_lower):
            total_weight += parse_weight(weight_str)

    if has_match_attempt and total_weight >= 1.0:
        return True

    # 3. Literal / Truthiness Fallback
    if condition_str.lower() == "1" or condition_str.lower() == "true":
        return True

    return False
