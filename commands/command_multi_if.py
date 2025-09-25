import re

def execute(parser, content, **kwargs):
    context = kwargs.get('context', '')
    sections = parser._split_toplevel_options(content)
    for section in sections:
        parts = section.split(':', 1)
        if len(parts) != 2: continue
        
        keywords = [k.strip().lower() for k in parts[0].split(',') if k.strip()]
        if any(re.search(r'\b' + re.escape(k) + r'\b', context.lower()) for k in keywords):
            return parts[1]
    return ""