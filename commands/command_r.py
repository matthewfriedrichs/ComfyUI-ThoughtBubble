# filename: thoughtbubble/commands/command_r.py

def execute(parser, args, **kwargs):
    if not args: return ""
    context = kwargs.get('context', '')
    
    resolved_parts = [arg.execute(parser, context=context).strip() for arg in args]
    
    try:
        min_val, max_val = 0, 100
        if len(resolved_parts) == 1:
            val = resolved_parts[0]
            max_val = float(val) if '.' in val else int(val)
            min_val = 0.0 if isinstance(max_val, float) else 0
        elif len(resolved_parts) >= 2:
            val1, val2 = resolved_parts[0], resolved_parts[1]
            min_val = float(val1) if '.' in val1 else int(val1)
            max_val = float(val2) if '.' in val2 else int(val2)
        
        if min_val > max_val: min_val, max_val = max_val, min_val
        
        if isinstance(min_val, float) or isinstance(max_val, float):
            return str(round(parser.rng.uniform(float(min_val), float(max_val)), 2))
        else:
            return str(parser.rng.randint(min_val, max_val))
    except (ValueError, IndexError):
        return ""