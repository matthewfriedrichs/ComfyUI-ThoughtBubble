# filename: thoughtbubble/commands/command_v.py

import re

NEG_TAG_START = '###NEG###'
NEG_TAG_END = '###/NEG###'

# --- 'GET' LOGIC HELPERS ---

def _get_unified_content(parser, var_name):
    """
    Gets content respecting priority:
    1. Control Vars
    2. Box Map
    3. Parser Variables
    """
    var_name = var_name.strip().lower()
    if not var_name:
        return ""
    
    # 1. Check control vars (e.g., node widget inputs)
    if var_name in parser.control_vars_by_name:
        return parser._recursive_resolve(str(parser.control_vars_by_name[var_name]))
    
    # 2. Check box_map (text boxes)
    if var_name in parser.box_map:
        return parser._recursive_resolve(parser.box_map[var_name])
        
    # 3. Fallback to parser variables (from v_set)
    if var_name in parser.variables:
        return parser._recursive_resolve(parser.variables[var_name])
        
    print(f"ThoughtBubble: Variable '{var_name}' not found in v() command.")
    return ""

def _eval_get_expression(parser, content):
    """
    Handles all 'get' logic: v(box1 + box2 - box3)
    '+' or 'no prefix' adds content, respecting its original state.
    '-' TOGGLES content (positive -> negative, negative -> positive).
    """
    # --- UPDATED REGEX ---
    # This regex now correctly handles spaces between operators and variable names.
    # It finds an optional prefix ([+-]?), skips spaces (\s*), 
    # and then finds a variable name ([^\s+-]\S*) which is defined
    # as starting with a non-operator, non-space character.
    var_tokens = re.findall(r'([+-]?)\s*([^\s+-]\S*)', content)
    
    final_parts = []
    
    for prefix, var_name in var_tokens:
        # Use the unified getter with priority
        var_content = _get_unified_content(parser, var_name).strip()
        
        if not var_content:
            continue
        
        # Check if the content is already fully negative
        is_negative = (
            var_content.startswith(NEG_TAG_START) and 
            var_content.endswith(NEG_TAG_END)
        )
        
        core_content = var_content
        if is_negative:
            # Get the "core" content without tags
            core_content = var_content[len(NEG_TAG_START):-len(NEG_TAG_END)].strip()

        if prefix == '-':
            # SUBTRACT / TOGGLE logic
            if is_negative:
                # Was negative, becomes positive
                final_parts.append(core_content)
            else:
                # Was positive, becomes negative
                final_parts.append(f"{NEG_TAG_START}{core_content}{NEG_TAG_END}")
        else:
            # ADD logic (prefix is '+' or '')
            # Just add the content as-is (respects its original state)
            final_parts.append(var_content)
    
    # Join parts with a comma
    return ", ".join(filter(None, final_parts))

# --- 'SET' LOGIC HELPERS ---

def _eval_set_expression(parser, expr):
    """
    Evaluates a simple string concatenation expression for setting a variable.
    e.g., "foo + bar" -> gets "foo" and "bar" from parser.variables.
    """
    # Split by '+'
    parts = parser._split_toplevel_options(expr, delimiter='+')
    resolved_parts = []
    
    for part in parts:
        var_name = part.strip().lower()
        if not var_name:
            continue
        
        # Get the value of this variable ONLY from parser.variables
        resolved_parts.append(parser.variables.get(var_name, ""))
        
    # Concatenate all parts with a space
    return " ".join(filter(None, resolved_parts))

# --- MAIN EXECUTE FUNCTION ---

def execute(parser, value, **kwargs):
    """
    Handles all v() command logic.
    - v(name|value) = SET
    - v(name)       = GET
    
    The 'value' passed in has already been recursively resolved by the parser.
    """
    
    # Check for the '|' delimiter to determine GET vs SET
    parts = parser._split_toplevel_options(value, delimiter='|')
    
    if len(parts) == 2:
        # --- THIS IS A 'SET' OPERATION: v(name|value) ---
        var_name = parts[0].strip().lower()
        
        # The value is *already resolved* by the parser's logic.
        # e.g., v(myvar|v(box)) -> parser calls execute(..., "myvar|box_content")
        resolved_value = parts[1].strip()
        
        # We save the literal, resolved value.
        parser.variables[var_name] = resolved_value
        
        return "" # 'Set' operations return no text to the prompt
    
    elif len(parts) == 1:
        # --- THIS IS A 'GET' OPERATION: v(name) ---
        content = parts[0].strip()
        # The content here is already resolved, but _eval_get_expression
        # will re-parse it (e.g., "positive - negative") and fetch
        # the content from boxes/vars.
        return _eval_get_expression(parser, content)
        
    else:
        # Invalid syntax, e.g. v(a|b|c)
        print(f"ThoughtBubble: Invalid v() syntax. Expected v(name) or v(name|value). Got: {value}")
        return ""
