# filename: thoughtbubble/commands/command_eq.py

def execute(parser, args, **kwargs):
    """
    Strict Equality Check.
    Syntax: eq( A | B | TrueBranch | FalseBranch )
    """
    if len(args) < 2:
        return ""
        
    context = kwargs.get('context', '')

    # Execute A and B
    val_a = args[0].execute(parser, context=context).strip().lower()
    val_b = args[1].execute(parser, context=context).strip().lower()
    
    is_match = (val_a == val_b)
    
    if is_match:
        if len(args) > 2:
            return args[2].execute(parser, context=context)
    else:
        if len(args) > 3:
            return args[3].execute(parser, context=context)
            
    return ""