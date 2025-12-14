# filename: thoughtbubble/commands/command_o.py
import os

def execute(parser, args, **kwargs):
    if not args: return ""
    filename = args[0].execute(parser, context=kwargs.get('context', '')).strip()
    if not filename: return ""
    if not filename.endswith('.txt'): filename += '.txt'
    
    filepath = os.path.join(parser.textfiles_directory, os.path.basename(filename))

    if filepath in parser.textfile_cache:
        return parser.textfile_cache[filepath]

    try:
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                parser.textfile_cache[filepath] = content
                return content
    except Exception:
        pass
    return ""