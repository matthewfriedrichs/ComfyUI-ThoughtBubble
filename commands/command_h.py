# filename: thoughtbubble/commands/command_h.py

def execute(parser, args, **kwargs):
    if not args: return ""
    context = kwargs.get('context', '')
    
    content = "".join([arg.execute(parser, context=context) for arg in args])
    return f" ###HIDDEN_START###{content}###HIDDEN_END### "