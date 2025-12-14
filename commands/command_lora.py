# filename: thoughtbubble/commands/command_lora.py

def execute(parser, args, **kwargs):
    if not args: return ""
    content = args[0].execute(parser, context=kwargs.get('context', '')).strip()
    
    try:
        parts = content.split(':')
        name = parts[0].strip()
        if not name: return ""
        
        model_str = 1.0
        clip_str = 1.0
        
        if len(parts) > 1:
            model_str = float(parts[1].strip())
            clip_str = model_str
            
        if len(parts) > 2:
            clip_str = float(parts[2].strip())

        parser.loras_to_load.append((name, model_str, clip_str))
    except (ValueError, IndexError):
        pass
    return ""