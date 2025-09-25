import re

def execute(parser, content, **kwargs):
    context = kwargs.get('context', '')
    parts = parser._split_toplevel_options(content)
    if len(parts) < 2: return ""
    
    keywords = [k.strip().lower() for k in parts[0].split(',') if k.strip()]
    true_text = parts[1]
    false_text = parts[2] if len(parts) > 2 else ""
    
    condition = any(re.search(r'\b' + re.escape(k) + r'\b', context.lower()) for k in keywords)
    return true_text if condition else false_text