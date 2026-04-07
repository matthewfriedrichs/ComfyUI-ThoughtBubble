# filename: thoughtbubble/commands/command_area.py

def execute(parser, args, **kwargs):
    if not args: return ""
    content = args[0].execute(parser, context=kwargs.get('context', '')).strip().lower()
    if content:
        parser.areas_to_apply.append(content)
    return ""