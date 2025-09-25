def execute(parser, content, **kwargs):
    try:
        parts = content.split(':')
        name = parts[0].strip()
        model_str = float(parts[1].strip())
        clip_str = float(parts[2].strip()) if len(parts) > 2 else model_str
        parser.loras_to_load.append((name, model_str, clip_str))
    except (ValueError, IndexError):
        pass
    return ""