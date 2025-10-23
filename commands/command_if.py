# filename: thoughtbubble/commands/command_if.py

import re

def _parse_weight(weight_str):
    """
    Parses a weight string.
    Converts '0.5' to 0.5 and '50' to 0.5.
    """
    try:
        weight_str = weight_str.strip()
        if '.' in weight_str:
            # Treat as a float (e.g., 0.5)
            return float(weight_str)
        else:
            # Treat as an integer and divide by 100 (e.g., 50 -> 0.5)
            return float(weight_str) / 100.0
    except ValueError:
        print(f"ThoughtBubble: Invalid weight format '{weight_str}'. Defaulting to 0.")
        return 0.0

def execute(parser, value, **kwargs):
    """
    Executes a conditional statement based on weighted context.
    Syntax: ?(word:weight, word2:weight|text_if_true|text_if_false)
              - Weights (e.g., 0.5 or 50) are summed. If sum >= 1.0, condition is true.
              - A word with no weight defaults to 1.0.
    """
    parts = parser._split_toplevel_options(value, delimiter='|')
    
    if not (2 <= len(parts) <= 3):
        print(f"ThoughtBubble: Invalid ?() syntax. Expected 2 or 3 parts, got {len(parts)}. Content: {value}")
        return ""

    condition_str = parts[0].strip()
    true_text = parts[1].strip()
    false_text = parts[2].strip() if len(parts) == 3 else ""
    
    is_condition_met = False
    
    # Perform a weighted context check
    context = kwargs.get('context', '').lower()
    total_weight = 0.0
    
    # Split by comma for multiple conditions (e.g., "word1:0.5, word2:0.5")
    conditions = parser._split_toplevel_options(condition_str, delimiter=',')
    
    for cond in conditions:
        cond = cond.strip()
        if not cond:
            continue

        word = ""
        weight_str = "1.0" # Default weight is 1.0 (or 100)

        # Check for colon-separated weight. Use rsplit to handle colons in the word.
        if ':' in cond:
            try:
                word, weight_str = cond.rsplit(':', 1)
                word = word.strip()
            except ValueError:
                word = cond.strip() # Malformed, treat whole string as word
        else:
            word = cond.strip() # No weight provided, e.g., ?(whiskers|cat|dog)

        # Find the word in the context
        if re.search(r'\b' + re.escape(word.lower()) + r'\b', context):
            total_weight += _parse_weight(weight_str)
            
    # Condition is met if the sum of found weights is 1.0 or more
    is_condition_met = total_weight >= 1.0
        
    return true_text if is_condition_met else false_text