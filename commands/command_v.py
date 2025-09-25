import re

def _resolve_operand(parser, name):
    title = name.lower()
    if title in parser.control_vars_by_name:
        return str(parser.control_vars_by_name[title])
    if title in parser.variables:
        return parser.variables[title]
    return parser.box_map.get(title, name)

def execute(parser, content, **kwargs):
    parts = parser._split_toplevel_options(content, delimiter='|')
    if len(parts) == 2:
        parser.variables[parts[0].strip().lower()] = parts[1].strip()
        return ""

    expr = parser.control_vars_by_name.get(content.strip().lower(), content)
    expr_parts = re.split(r'([+-])', str(expr))
    result = _resolve_operand(parser, expr_parts[0].strip())
    
    i = 1
    while i < len(expr_parts):
        op, operand_name = expr_parts[i].strip(), expr_parts[i+1].strip()
        operand_content = _resolve_operand(parser, operand_name)
        if op == '+':
            result = f"{result}, {operand_content}"
        elif op == '-':
            result = f"{result}, ###NEG###{operand_content}###/NEG###"
        i += 2
    return result