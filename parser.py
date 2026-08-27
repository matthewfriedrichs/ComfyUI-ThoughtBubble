"""
thoughtbubble/parser.py - Unified Lisp-like Prompt Programming Language Engine.
Minimal Python kernel with self-hosted standard library (PRELUDE), tape inspection,
non-destructive prefix driver binding, and live diff-tracking persisters.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass, field
import functools
import operator
import os
import random
import re
from typing import Any, Callable, Dict, List, Optional, Set, Tuple, Union


# ============================================================================
# 1. TOKENIZER & LEXER
# ============================================================================

class TokenType:
    TEXT = "TEXT"
    IDENT = "IDENT"
    LPAREN = "LPAREN"  # (
    RPAREN = "RPAREN"  # )
    PIPE = "PIPE"      # |
    COLON = "COLON"    # :
    EOF = "EOF"


@dataclass(slots=True)
class Token:
    type: str
    value: str
    pos: int


class Lexer:
    def __init__(self, text: str):
        self.text = text
        self.pos = 0
        self.length = len(text)

    def tokenize(self) -> List[Token]:
        tokens: List[Token] = []
        buf: List[str] = []

        def flush_text():
            if buf:
                tokens.append(Token(TokenType.TEXT, "".join(buf), self.pos - len(buf)))
                buf.clear()

        def flush_before_lparen():
            if not buf:
                return
            raw = "".join(buf)
            buf.clear()
            if raw.endswith((" ", "\t", "\n", "\r", ",", ";")):
                tokens.append(Token(TokenType.TEXT, raw, self.pos - len(raw)))
                return
            m = re.search(r'([a-zA-Z0-9_]+|[^\s\w,;:\'\"()\[\]{}]+)$', raw)
            if m:
                prefix = raw[:m.start(1)]
                ident = m.group(1)
                if prefix:
                    tokens.append(Token(TokenType.TEXT, prefix, self.pos - len(raw)))
                tokens.append(Token(TokenType.IDENT, ident, self.pos - len(ident)))
            else:
                tokens.append(Token(TokenType.TEXT, raw, self.pos - len(raw)))

        while self.pos < self.length:
            char = self.text[self.pos]
            if char == "\\":
                if self.pos + 1 < self.length:
                    next_char = self.text[self.pos + 1]
                    if next_char in ("(", ")", "|", ":", "\\"):
                        buf.append(next_char)
                        self.pos += 2
                        continue
                buf.append("\\")
                self.pos += 1
                continue

            if char == "(":
                flush_before_lparen()
                tokens.append(Token(TokenType.LPAREN, "(", self.pos))
                self.pos += 1
            elif char == ")":
                flush_text()
                tokens.append(Token(TokenType.RPAREN, ")", self.pos))
                self.pos += 1
            elif char == "|":
                flush_text()
                tokens.append(Token(TokenType.PIPE, "|", self.pos))
                self.pos += 1
            elif char == ":":
                flush_text()
                tokens.append(Token(TokenType.COLON, ":", self.pos))
                self.pos += 1
            else:
                buf.append(char)
                self.pos += 1

        flush_text()
        tokens.append(Token(TokenType.EOF, "", self.pos))
        return tokens


# ============================================================================
# 2. SCOPE, CLOSURES & PERSISTENCE
# ============================================================================

@dataclass
class PersisterRecord:
    name: str
    start_pos: int
    end_pos: int
    initial_value: str
    current_value: str


class Environment:
    __slots__ = ("parent", "bindings")

    def __init__(self, parent: Optional[Environment] = None):
        self.parent = parent
        self.bindings: Dict[str, Any] = {}

    def get(self, name: str) -> Optional[Any]:
        if name in self.bindings:
            return self.bindings[name]
        if self.parent:
            return self.parent.get(name)
        return None

    def define(self, name: str, value: Any) -> None:
        self.bindings[name] = value

    def set(self, name: str, value: Any) -> None:
        if name in self.bindings or self.parent is None:
            self.bindings[name] = value
        else:
            self.parent.set(name, value)


@dataclass(slots=True)
class UserFunction:
    name: str
    params: List[str]
    body: "ASTNode"
    closure_env: Environment
    defaults: Dict[str, Optional["ASTNode"]] = field(default_factory=dict)

    def call(self, ctx: "CanvasParser", args: List["BranchNode"]) -> str:
        ctx.call_depth += 1
        if ctx.call_depth > ctx.max_call_depth:
            ctx.call_depth -= 1
            return ""

        evaluated: List[Tuple[str, float]] = []
        for b in args:
            val = b.value.evaluate(ctx)
            wt = b.weight if b.weight is not None else 1.0
            evaluated.append((val, wt))

        call_env = Environment(parent=self.closure_env)
        for i, param in enumerate(self.params):
            val_node: Optional[ASTNode] = None
            if i < len(evaluated):
                arg_val = evaluated[i][0]
                if arg_val != "" or param not in self.defaults or self.defaults[param] is None:
                    val_node = TextNode(arg_val)
            if val_node is None and param in self.defaults and self.defaults[param] is not None:
                val_node = self.defaults[param]
            call_env.define(param, val_node if val_node is not None else TextNode(""))

        prev_env = ctx.current_env
        ctx.current_env = call_env
        ctx.arg_stack.append(evaluated)
        try:
            return self.body.evaluate(ctx)
        finally:
            ctx.arg_stack.pop()
            ctx.current_env = prev_env
            ctx.call_depth -= 1


def extract_inline_params(node: ASTNode, seen: Optional[Dict[str, Optional[ASTNode]]] = None) -> Dict[str, Optional[ASTNode]]:
    if seen is None:
        seen = {}
    if isinstance(node, SequenceNode):
        for child in node.children:
            extract_inline_params(child, seen)
    elif isinstance(node, InvocationNode):
        callee_name = node.callee.value.strip().lower() if isinstance(node.callee, TextNode) else ""
        if callee_name in ("v", "p") and node.args:
            var_name = node.args[0].value.value.strip().lower() if isinstance(node.args[0].value, TextNode) else ""
            if var_name and var_name not in seen:
                default_node = node.args[1].value if len(node.args) > 1 else None
                seen[var_name] = default_node
        else:
            extract_inline_params(node.callee, seen)
        for arg in node.args:
            extract_inline_params(arg.value, seen)
    return seen


# ============================================================================
# 3. AST NODES
# ============================================================================

class ASTNode:
    def evaluate(self, ctx: "CanvasParser") -> str:
        raise NotImplementedError


@dataclass(slots=True)
class TextNode(ASTNode):
    value: str

    def evaluate(self, ctx: CanvasParser) -> str:
        return self.value


@dataclass(slots=True)
class SequenceNode(ASTNode):
    children: List[ASTNode]

    def evaluate(self, ctx: CanvasParser) -> str:
        results = []
        prev_tail = ctx.active_sequence_tail
        for i, child in enumerate(self.children):
            ctx.active_sequence_tail = self.children[i + 1:]
            chunk = child.evaluate(ctx)
            results.append(chunk)
            if chunk:
                ctx.rendered_stream.append(chunk)
        ctx.active_sequence_tail = prev_tail
        return "".join(results)


@dataclass(slots=True)
class BranchNode:
    value: ASTNode
    weight: Optional[float] = 1.0


@dataclass(slots=True)
class InvocationNode(ASTNode):
    callee: ASTNode
    args: List[BranchNode]
    start_pos: int = -1
    end_pos: int = -1
    driver: Optional[ASTNode] = None

    def evaluate(self, ctx: CanvasParser) -> str:
        prev_span = ctx.current_invocation_span
        prev_driver = ctx.current_driver
        ctx.current_invocation_span = (self.start_pos, self.end_pos)

        if self.driver is not None:
            ctx.current_driver = self.driver.evaluate(ctx).strip()

        try:
            if isinstance(self.callee, TextNode):
                name = self.callee.value.strip().lower()
                scoped = ctx.current_env.get(name)
                if isinstance(scoped, UserFunction):
                    return scoped.call(ctx, self.args)
                if name in ctx.command_handlers:
                    return ctx.command_handlers[name](ctx, self.args)

            op = self.callee.evaluate(ctx).strip()
            scoped = ctx.current_env.get(op.lower())
            if isinstance(scoped, UserFunction):
                return scoped.call(ctx, self.args)
            if op.lower() in ctx.command_handlers:
                return ctx.command_handlers[op.lower()](ctx, self.args)

            if op == "":
                if len(self.args) == 1:
                    b = self.args[0]
                    val = b.value.evaluate(ctx)
                    if b.weight is not None and b.weight != 1.0:
                        return f"({val}:{b.weight})"
                    return f"({val})"
                return "|".join(b.value.evaluate(ctx) for b in self.args)

            rendered_args = "|".join(
                f"{b.value.evaluate(ctx)}" + (f":{b.weight}" if b.weight != 1.0 else "")
                for b in self.args
            )
            return f"{op}({rendered_args})"
        finally:
            ctx.current_invocation_span = prev_span
            ctx.current_driver = prev_driver


# ============================================================================
# 3b. PERMUTATION GROUPS (used by n())
# ============================================================================

def _is_option_group(node: ASTNode) -> bool:
    """A bare (a|b|c) node -- no leading identifier, more than one option.
    Single-branch bare parens like (word) are just pass-through grouping/weighting
    and are never treated as a permutation dimension."""
    return (
        isinstance(node, InvocationNode)
        and isinstance(node.callee, TextNode)
        and node.callee.value == ""
        and len(node.args) > 1
    )


def _collect_option_groups(node: ASTNode, collected: List[InvocationNode]) -> None:
    """Find every (a|b|c) group in a slot's template, left-to-right. Does not
    look inside a group's own options, and does not look inside other command
    calls -- only literal text and structural sequencing are transparent."""
    if isinstance(node, SequenceNode):
        for child in node.children:
            _collect_option_groups(child, collected)
    elif _is_option_group(node):
        collected.append(node)


def _render_permutation_slot(node: ASTNode, selections: Dict[int, int], ctx: "CanvasParser") -> str:
    """Render a slot's template, substituting each collected group with its
    chosen option for this combination. Anything else evaluates normally."""
    if isinstance(node, TextNode):
        return node.value
    if isinstance(node, SequenceNode):
        return "".join(_render_permutation_slot(c, selections, ctx) for c in node.children)
    if _is_option_group(node):
        idx = selections.get(id(node), 0)
        branch = node.args[idx % len(node.args)]
        return _render_permutation_slot(branch.value, selections, ctx)
    return node.evaluate(ctx)


# ============================================================================
# 4. MATH ENGINE, COMPARISONS & COERCION
# ============================================================================

def _loose_equals(a: Any, b: Any) -> bool:
    sa = str(a).strip()
    sb = str(b).strip()
    if sa.lower() == sb.lower():
        return True
    try:
        return float(sa) == float(sb)
    except ValueError:
        return False


def _eval_condition(ctx: CanvasParser, cond_str: str) -> bool:
    s = cond_str.strip()
    s_lower = s.lower()

    if s_lower in ("", "0", "false", "none", "null", "no", "0.0"):
        return False
    if s_lower in ("1", "true", "yes"):
        return True

    try:
        num = float(s)
        return num != 0.0
    except ValueError:
        pass

    current_tape = "".join(ctx.rendered_stream).lower()
    return s_lower in current_tape


def _is_matching_enclosure(s: str) -> bool:
    if not (s.startswith("(") and s.endswith(")")):
        return False
    depth = 0
    for i, char in enumerate(s):
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0 and i < len(s) - 1:
                return False
    return depth == 0


def _split_math_args(inner: str) -> List[str]:
    args, buf = [], []
    depth = 0
    for char in inner:
        if char == "(":
            depth += 1
            buf.append(char)
        elif char == ")":
            depth -= 1
            buf.append(char)
        elif char == "|" and depth == 0:
            args.append("".join(buf).strip())
            buf.clear()
        else:
            buf.append(char)
    if buf or inner == "":
        args.append("".join(buf).strip())
    return args


def _parse_math_prefix(s: str) -> Optional[Tuple[str, List[str]]]:
    s = s.strip()
    m = re.match(r"^([+\-*/%^<>=!&|]+|[a-zA-Z_]\w*)\((.*)\)$", s, re.DOTALL)
    if not m:
        return None
    return m.group(1), _split_math_args(m.group(2))


def _eval_math_core(expr_str: str) -> Tuple[Union[int, float, bool, str], bool]:
    s = expr_str.strip()
    while _is_matching_enclosure(s):
        s = s[1:-1].strip()

    prefix = _parse_math_prefix(s)
    if prefix:
        op, raw_args = prefix
        if op.lower() in ("m", "calc", "math"):
            return _eval_math_core(raw_args[0] if raw_args else "0")

        eval_args: List[Any] = []
        all_float = True
        for a in raw_args:
            val, is_flt = _eval_math_core(a)
            eval_args.append(val)
            if not is_flt:
                all_float = False

        res = _apply_math_op(op, eval_args)
        if isinstance(res, bool):
            return res, False
        if isinstance(res, str):
            return res, False
        if all_float and isinstance(res, (int, float)):
            return float(res), True
        if isinstance(res, (int, float)):
            return int(res), False
        return str(res), False

    if re.fullmatch(r"[-+]?\d+", s):
        return int(s), False
    if re.fullmatch(r"[-+]?(?:\d+\.\d*|\.\d+)(?:[eE][-+]?\d+)?", s):
        return float(s), True

    try:
        return _eval_infix_ast(s)
    except Exception:
        return s, False


def _apply_math_op(op: str, args: List[Any]) -> Any:
    if not args:
        return 0

    if op in ("=", "=="):
        if len(args) < 2:
            return True
        first = args[0]
        return all(_loose_equals(first, x) for x in args[1:])

    if op in ("!=", "ne", "neq"):
        if len(args) < 2:
            return False
        return not _loose_equals(args[0], args[1])

    if op in ("+", "add"):
        if any(isinstance(x, str) and not re.fullmatch(r"[-+]?\d+(\.\d+)?", str(x).strip()) for x in args):
            return "".join(str(x) for x in args)
        return functools.reduce(operator.add, [float(x) if "." in str(x) else int(x) for x in args])

    if op in ("*", "mul"):
        return functools.reduce(operator.mul, [float(x) if "." in str(x) else int(x) for x in args])

    if op in ("-", "sub"):
        num_args = [float(x) if "." in str(x) else int(x) for x in args]
        if len(num_args) == 1:
            return -num_args[0]
        return functools.reduce(operator.sub, num_args)

    if op in ("/", "div"):
        num_args = [float(x) for x in args]
        if any(b == 0 for b in num_args[1:]):
            raise ZeroDivisionError("Division by zero")
        return functools.reduce(lambda a, b: a / b, num_args)

    if op in ("//", "floordiv"):
        num_args = [int(float(x)) for x in args]
        if any(b == 0 for b in num_args[1:]):
            raise ZeroDivisionError("Division by zero")
        return functools.reduce(lambda a, b: a // b, num_args)

    if op in ("%", "mod"):
        num_args = [int(float(x)) for x in args]
        if len(num_args) > 1 and num_args[1] == 0:
            raise ZeroDivisionError("Modulo by zero")
        return num_args[0] % num_args[1]

    if op in ("^", "**", "pow"):
        num_args = [float(x) if "." in str(x) else int(x) for x in args]
        return num_args[0] ** num_args[1]

    if op == "<":
        return float(args[0]) < float(args[1])
    if op == "<=":
        return float(args[0]) <= float(args[1])
    if op == ">":
        return float(args[0]) > float(args[1])
    if op == ">=":
        return float(args[0]) >= float(args[1])
    if op in ("!", "not"):
        return not bool(args[0]) and str(args[0]).lower() not in ("0", "false", "")
    if op in ("&", "and"):
        return all(bool(x) and str(x).lower() not in ("0", "false", "") for x in args)
    if op in ("|", "or"):
        return any(bool(x) and str(x).lower() not in ("0", "false", "") for x in args)

    raise ValueError(f"Unknown math operator '{op}'")


_INFIX_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
}


def _eval_infix_ast(expr: str) -> Tuple[Union[int, float, bool], bool]:
    tree = ast.parse(expr, mode="eval").body
    has_integer = False

    def _walk(node) -> Any:
        nonlocal has_integer
        if isinstance(node, ast.Constant):
            if isinstance(node.value, int) and not isinstance(node.value, bool):
                has_integer = True
            elif isinstance(node.value, bool):
                has_integer = True
            return node.value
        if isinstance(node, ast.BinOp):
            left = _walk(node.left)
            right = _walk(node.right)
            if isinstance(node.op, (ast.Div, ast.FloorDiv, ast.Mod)) and right == 0:
                raise ZeroDivisionError("Division by zero")
            return _INFIX_OPS[type(node.op)](left, right)
        if isinstance(node, ast.Compare):
            left = _walk(node.left)
            has_integer = True
            return all(_INFIX_OPS[type(op)](left, _walk(comp)) for op, comp in zip(node.ops, node.comparators))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
            return -_walk(node.operand)
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
            has_integer = True
            return not bool(_walk(node.operand))
        raise ValueError("Unsupported syntax")

    res = _walk(tree)
    if isinstance(res, bool):
        return (1 if res else 0), False
    if has_integer:
        return int(res), False
    return float(res), True


# ============================================================================
# 5. RECURSIVE DESCENT PARSER
# ============================================================================

def _try_parse_weight(s: str) -> Optional[float]:
    try:
        val = float(s.strip())
        return val if val >= 0.0 else None
    except ValueError:
        return None


class Parser:
    def __init__(self, tokens: List[Token]):
        self.tokens = tokens
        self.pos = 0
        self.length = len(tokens)

    def parse(self) -> ASTNode:
        nodes = self._parse_sequence(lambda: self._peek().type == TokenType.EOF)
        return nodes[0] if len(nodes) == 1 else SequenceNode(nodes)

    def _parse_sequence(self, stop_cond: Callable[[], bool]) -> List[ASTNode]:
        nodes: List[ASTNode] = []
        while not stop_cond() and not self._is_at_end():
            expr = self._parse_expression()
            if expr:
                if isinstance(expr, SequenceNode):
                    nodes.extend(expr.children)
                else:
                    nodes.append(expr)
        return nodes

    def _parse_expression(self) -> Optional[ASTNode]:
        expr = self._parse_primary()
        if expr is None:
            return None

        # Check for driver syntax: <driver_expr> : <invocation>
        if self._check(TokenType.COLON):
            saved_pos = self.pos
            self._advance()  # consume ':'
            if (
                (self._check(TokenType.IDENT) and self.pos + 1 < self.length and self.tokens[self.pos + 1].type == TokenType.LPAREN)
                or self._check(TokenType.LPAREN)
            ):
                target = self._parse_primary()
                if isinstance(target, InvocationNode):
                    if isinstance(expr, InvocationNode):
                        target.driver = expr
                        return target
                    elif isinstance(expr, TextNode):
                        m = re.search(r'^(.*?)([-+]?\d+(?:\.\d+)?)$', expr.value, re.DOTALL)
                        if m:
                            prefix, num_str = m.group(1), m.group(2)
                            target.driver = TextNode(num_str)
                            if prefix:
                                return SequenceNode([TextNode(prefix), target])
                            return target

            # Backtrack if not a valid driver invocation so weights and normal colons parse cleanly
            self.pos = saved_pos

        return expr

    def _parse_primary(self) -> Optional[ASTNode]:
        if self._check(TokenType.IDENT):
            ident_tok = self._advance()
            callee: ASTNode = TextNode(ident_tok.value)
            if self._match(TokenType.LPAREN):
                start_pos = ident_tok.pos
                args = self._parse_argument_list()
                rparen = self._consume(TokenType.RPAREN, "Expected ')' after argument list.")
                node: ASTNode = InvocationNode(callee=callee, args=args, start_pos=start_pos, end_pos=rparen.pos + 1)
                while self._match(TokenType.LPAREN):
                    args = self._parse_argument_list()
                    rparen = self._consume(TokenType.RPAREN, "Expected ')' after argument list.")
                    node = InvocationNode(callee=node, args=args, start_pos=start_pos, end_pos=rparen.pos + 1)
                return node
            return callee

        if self._match(TokenType.LPAREN):
            start_pos = self.tokens[self.pos - 1].pos
            args = self._parse_argument_list()
            rparen = self._consume(TokenType.RPAREN, "Expected ')' after argument list.")
            node = InvocationNode(callee=TextNode(""), args=args, start_pos=start_pos, end_pos=rparen.pos + 1)
            while self._match(TokenType.LPAREN):
                args = self._parse_argument_list()
                rparen = self._consume(TokenType.RPAREN, "Expected ')' after argument list.")
                node = InvocationNode(callee=node, args=args, start_pos=start_pos, end_pos=rparen.pos + 1)
            return node

        if self._check(TokenType.TEXT):
            return TextNode(self._advance().value)
        if self._check(TokenType.COLON):
            return TextNode(self._advance().value)
        return None

    def _parse_argument_list(self) -> List[BranchNode]:
        branches: List[BranchNode] = []
        if self._check(TokenType.RPAREN):
            return [BranchNode(TextNode(""))]

        while not self._is_at_end():
            branches.append(self._parse_branch())
            if self._match(TokenType.PIPE):
                if self._check(TokenType.RPAREN):
                    branches.append(BranchNode(TextNode("")))
                    break
                continue
            break
        return branches

    def _parse_branch(self) -> BranchNode:
        raw_nodes = self._parse_sequence(
            lambda: self._peek().type in (TokenType.PIPE, TokenType.RPAREN)
        )
        if not raw_nodes:
            return BranchNode(value=TextNode(""), weight=1.0)

        weight = 1.0
        if len(raw_nodes) >= 2:
            last_node = raw_nodes[-1]
            prev_node = raw_nodes[-2]
            if isinstance(last_node, TextNode) and isinstance(prev_node, TextNode) and prev_node.value == ":":
                parsed_wt = _try_parse_weight(last_node.value)
                if parsed_wt is not None:
                    weight = parsed_wt
                    raw_nodes = raw_nodes[:-2]

        val = raw_nodes[0] if len(raw_nodes) == 1 else SequenceNode(raw_nodes) if raw_nodes else TextNode("")
        return BranchNode(value=val, weight=weight)

    def _peek(self) -> Token:
        return self.tokens[self.pos] if self.pos < self.length else self.tokens[-1]

    def _check(self, t: str) -> bool:
        return not self._is_at_end() and self._peek().type == t

    def _match(self, t: str) -> bool:
        if self._check(t):
            self.pos += 1
            return True
        return False

    def _consume(self, t: str, err: str) -> Token:
        if self._check(t):
            tok = self._peek()
            self.pos += 1
            return tok
        raise SyntaxError(f"{err} at pos {self._peek().pos}")

    def _advance(self) -> Token:
        tok = self._peek()
        self.pos += 1
        return tok

    def _is_at_end(self) -> bool:
        return self.pos >= self.length or self._peek().type == TokenType.EOF


# ============================================================================
# 6. PRELUDE — Self-Hosted Standard Library
# ============================================================================

PRELUDE = r"""
def(step_seed|mute(v(global_seed|m(%((+(m(*(1103515245|v(global_seed)))|12345))|2147483648)))))
def(tick_run|mute(v(global_run|m(+(v(global_run)|1)))))
def(step_run|tick_run())
def(_cond_step|idx|?(m(=(idx|m(-(argc()|1))))|arg(idx)|?(m(<(idx|argc()))|?(arg(idx)|arg(m(+(idx|1)))|_cond_step(m(+(idx|2))))|)))
def(??|_cond_step(0))
def(multi_if|_cond_step(0))
def(clamp|val|min_v|max_v|?(m(<(val|min_v))|min_v|?(m(>(val|max_v))|max_v|val)))
def(_loop_step|idx|count|fn_name|?(m(<(idx|count))|fn_name(idx) _loop_step(m(+(idx|1))|count|fn_name)|))
def(loop|count|fn_name|_loop_step(0|count|fn_name))
def(_join_step|sep|idx|?(m(<(idx|argc()))|sep arg(idx) _join_step(sep|m(+(idx|1)))|))
def(join|sep|?(m(>(argc()|1))|arg(1)_join_step(sep|2)|))
"""


# ============================================================================
# 7. CANVAS PARSER ENGINE
# ============================================================================

class CanvasParser:
    def __init__(
        self,
        box_map: Optional[Dict[str, str]] = None,
        wildcard_data: Optional[Dict[str, List[str]]] = None,
        textfiles_directory: str = "",
        rng: Optional[random.Random] = None,
        iterator: int = 0,
        seed: int = 0,
        control_vars_by_name: Optional[Dict[str, Any]] = None,
        textfile_cache: Optional[Dict[str, str]] = None,
        **kwargs
    ):
        self.box_map = {k.lower(): v for k, v in (box_map or {}).items()}
        self.wildcards = wildcard_data or {}
        self.textfiles_directory = textfiles_directory
        self.rng = rng or random.Random()
        self.iterator = iterator
        self.seed_val = seed
        self.control_vars_by_name = control_vars_by_name or {}
        self.textfile_cache = textfile_cache if textfile_cache is not None else {}

        # Output Buffers
        self.loras_to_load: List[Tuple[str, float, float]] = []
        self.negative_prompt_parts: List[str] = []

        # State, Persistence & Scope
        self.rendered_stream: List[str] = []
        self.active_sequence_tail: List[ASTNode] = []
        self.global_env = Environment()
        self.current_env = self.global_env
        self.resolving_vars: Set[str] = set()
        self.call_depth = 0
        self.max_call_depth = 50
        self.in_math = False
        self.current_driver: Optional[str] = None
        self.step_counter: int = 0
        self.current_invocation_span: Tuple[int, int] = (-1, -1)
        self.persisters: Dict[str, PersisterRecord] = {}
        self.changed_persisters: List[Dict[str, str]] = []
        self.mutated_source: str = ""
        self.command_handlers: Dict[str, Callable[[CanvasParser, List[BranchNode]], str]] = {}
        self.arg_stack: List[List[Tuple[str, float]]] = []
        self.custom_prelude = kwargs.get("custom_prelude", "") or ""

        self._register_kernel()

    def register(self, *names: str):
        def decorator(fn: Callable[[CanvasParser, List[BranchNode]], str]):
            for name in names:
                self.command_handlers[name.lower()] = fn
            return fn
        return decorator

    def get_global_run(self) -> int:
        for name in ("global_run", "run"):
            entry = self.current_env.get(name)
            if entry is not None:
                try:
                    val_str = entry.evaluate(self) if isinstance(entry, ASTNode) else str(entry)
                    return int(float(val_str.strip()))
                except Exception:
                    pass
        return self.iterator

    def get_global_seed(self) -> int:
        for name in ("global_seed", "seed"):
            entry = self.current_env.get(name)
            if entry is not None:
                try:
                    val_str = entry.evaluate(self) if isinstance(entry, ASTNode) else str(entry)
                    return int(float(val_str.strip()))
                except Exception:
                    pass
        return self.seed_val

    def get_driver_or_run(self) -> int:
        if self.current_driver is not None:
            try:
                return int(float(self.current_driver))
            except ValueError:
                pass
        return self.get_global_run()

    def get_driver_or_seed(self) -> int:
        if self.current_driver is not None:
            try:
                return int(float(self.current_driver))
            except ValueError:
                pass
        return self.get_global_seed()

    def parse(self, text: str, return_mutated: bool = False) -> Union[Tuple[str, str], Tuple[str, str, str]]:
        self.loras_to_load = []
        self.negative_prompt_parts = []
        self.rendered_stream = []
        self.active_sequence_tail = []
        self.global_env = Environment()
        self.persisters = {}
        self.changed_persisters = []
        self.mutated_source = text
        self.step_counter = 0
        self.current_driver = None

        # Seed pre-bound global variables
        self.global_env.define("global_run", TextNode(str(self.iterator)))
        self.global_env.define("run", TextNode(str(self.iterator)))
        self.global_env.define("global_seed", TextNode(str(self.seed_val)))
        self.global_env.define("seed", TextNode(str(self.seed_val)))

        self.current_env = self.global_env
        self.resolving_vars = set()
        self.call_depth = 0
        self.in_math = False
        self.arg_stack = []

        # Load standard library & custom prelude
        self.parse_fragment(PRELUDE)
        if self.custom_prelude:
            self.parse_fragment(self.custom_prelude)

        # Clear side-effects produced during bootstrap
        self.rendered_stream = []
        self.negative_prompt_parts = []
        self.loras_to_load = []
        self.persisters = {}
        self.changed_persisters = []

        # Pre-pass: Intercept standard <lora:name:weight>
        def extract_angle_loras(match):
            parts = match.group(1).split(":")
            if len(parts) >= 1:
                name = parts[0].strip().strip("'\"")
                try:
                    m_wt = float(parts[1]) if len(parts) > 1 else 1.0
                except ValueError:
                    m_wt = 1.0
                try:
                    c_wt = float(parts[2]) if len(parts) > 2 else m_wt
                except ValueError:
                    c_wt = m_wt
                if name:
                    self.loras_to_load.append((name, m_wt, c_wt))
            return " " * len(match.group(0))

        clean_text = re.sub(r"<lora:([^>]+)>", extract_angle_loras, text, flags=re.IGNORECASE)
        raw_pos = self.parse_fragment(clean_text)

        # Rewrite modified persisters back into source text from right to left
        current_source = text
        changed_persisters_list = [
            p for p in self.persisters.values()
            if p.start_pos >= 0 and p.end_pos > p.start_pos and p.current_value != p.initial_value
        ]
        changed_persisters_list.sort(key=lambda p: p.start_pos, reverse=True)
        for p in changed_persisters_list:
            replacement = f"p({p.name}|{p.current_value})"
            current_source = current_source[:p.start_pos] + replacement + current_source[p.end_pos:]

        self.mutated_source = current_source
        self.changed_persisters = [
            {"name": p.name, "old_value": p.initial_value, "new_value": p.current_value}
            for p in changed_persisters_list
        ]

        pos_res, neg_res = self._post_process(raw_pos)

        if return_mutated:
            return pos_res, neg_res, self.mutated_source
        return pos_res, neg_res

    def parse_fragment(self, text: str, is_root: bool = False, **kwargs) -> Any:
        tokens = Lexer(text).tokenize()
        ast_root = Parser(tokens).parse()
        resolved = ast_root.evaluate(self)
        if is_root:
            return self._post_process(resolved)
        return resolved

    def _post_process(self, positive_text: str) -> Tuple[str, str]:
        pos_parts = [p.strip() for p in re.sub(r"\s+", " ", positive_text).split(",") if p.strip()]
        positive_prompt = ", ".join(pos_parts)
        neg_raw = ", ".join(self.negative_prompt_parts)
        neg_parts = [p.strip() for p in re.sub(r"\s+", " ", neg_raw).split(",") if p.strip()]
        negative_prompt = ", ".join(neg_parts)
        return positive_prompt, negative_prompt

    def _fetch_list_source(self, key: str) -> Optional[List[str]]:
        k = key.lower().strip()
        if k in self.wildcards:
            return self.wildcards[k]
        if k in self.box_map:
            return [line for line in self.box_map[k].split("\n") if line.strip()]
        if k in self.control_vars_by_name:
            return [line for line in str(self.control_vars_by_name[k]).split("\n") if line.strip()]
        return None

    def apply_loras(self, model=None, clip=None):
        if not self.loras_to_load or (model is None and clip is None):
            return model, clip
        import comfy.sd
        import comfy.utils
        import folder_paths

        model_out = model.clone() if model is not None else None
        clip_out = clip.clone() if clip is not None else None
        available_loras = folder_paths.get_filename_list("loras")

        for lora_name, model_strength, clip_strength in self.loras_to_load:
            lora_filename = self._resolve_lora_path(lora_name, available_loras)
            if not lora_filename:
                print(f"[ThoughtBubble Parser] Could not find LoRA matching '{lora_name}'.")
                continue
            try:
                lora_path = folder_paths.get_full_path("loras", lora_filename)
                if not lora_path or not os.path.exists(lora_path):
                    lora_path = lora_filename
                lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
                model_out, clip_out = comfy.sd.load_lora_for_models(
                    model_out, clip_out, lora, model_strength, clip_strength
                )
            except Exception as e:
                print(f"[ThoughtBubble Parser] Failed loading LoRA '{lora_filename}': {e}")
        return model_out, clip_out

    @staticmethod
    def _resolve_lora_path(query: str, available_loras: List[str]) -> Optional[str]:
        target = query.strip().strip("'\"").replace("\\", "/").lower()
        target_base = os.path.splitext(os.path.basename(target))[0]
        target_no_ext = os.path.splitext(target)[0]

        for l in available_loras:
            l_norm = l.replace("\\", "/").lower()
            if l_norm == target:
                return l
        for l in available_loras:
            l_norm = l.replace("\\", "/").lower()
            if os.path.splitext(l_norm)[0] == target_no_ext:
                return l
        for l in available_loras:
            l_norm = l.replace("\\", "/").lower()
            if os.path.splitext(os.path.basename(l_norm))[0] == target_base:
                return l
        for l in available_loras:
            l_norm = l.replace("\\", "/").lower()
            if l_norm.startswith(target) or os.path.splitext(l_norm)[0].startswith(target_no_ext):
                return l
        raw_clean = query.strip().strip("'\"")
        if os.path.exists(raw_clean):
            return raw_clean
        return None

    # ------------------------------------------------------------------
    # The Minimal Kernel
    # ------------------------------------------------------------------
    def _register_kernel(self):
        # 1. Scope, Closures, Variables & Persisters
        @self.register("def")
        def handle_def(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if len(args) < 2:
                return ""
            name = args[0].value.evaluate(ctx).strip().lower()
            if len(args) == 2:
                fn = UserFunction(name=name, params=[], body=args[1].value, closure_env=ctx.current_env)
                ctx.current_env.define(name, fn)
                return ""
            params = [arg.value.evaluate(ctx).strip().lower() for arg in args[1:-1]]
            fn = UserFunction(name=name, params=params, body=args[-1].value, closure_env=ctx.current_env)
            ctx.current_env.define(name, fn)
            return ""

        @self.register("f")
        def handle_f(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if not args:
                return ""
            name = args[0].value.evaluate(ctx).strip().lower()
            if len(args) == 2:
                body_node = args[1].value
                params_map = extract_inline_params(body_node)
                fn = UserFunction(name=name, params=list(params_map.keys()), body=body_node, closure_env=ctx.current_env, defaults=params_map)
                ctx.current_env.define(name, fn)
                return ""
            if len(args) > 2:
                params = [arg.value.evaluate(ctx).strip().lower() for arg in args[1:-1]]
                fn = UserFunction(name=name, params=params, body=args[-1].value, closure_env=ctx.current_env)
                ctx.current_env.define(name, fn)
                return ""
            scoped = ctx.current_env.get(name)
            if isinstance(scoped, UserFunction):
                return scoped.call(ctx, [])
            return ""

        @self.register("fn")
        def handle_fn(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if not args:
                return ""
            params = [arg.value.evaluate(ctx).strip().lower() for arg in args[:-1]]
            fn = UserFunction(name="<anon>", params=params, body=args[-1].value, closure_env=ctx.current_env)
            temp_id = f"__lambda_{id(fn)}__"
            ctx.current_env.define(temp_id, fn)
            return temp_id

        @self.register("let")
        def handle_let(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if len(args) < 3:
                return ""
            var_name = args[0].value.evaluate(ctx).strip().lower()
            var_val = args[1].value.evaluate(ctx)
            let_env = Environment(parent=ctx.current_env)
            let_env.define(var_name, TextNode(var_val))
            prev_env = ctx.current_env
            ctx.current_env = let_env
            try:
                return args[2].value.evaluate(ctx)
            finally:
                ctx.current_env = prev_env

        @self.register("p", "persister")
        def handle_p(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if not args:
                return ""
            raw_name = args[0].value.evaluate(ctx).strip()
            name = raw_name.lower()
            if len(args) > 1:
                initial_val = args[1].value.evaluate(ctx)
                start_pos, end_pos = ctx.current_invocation_span
                if ctx.call_depth == 0 and start_pos >= 0 and end_pos > start_pos:
                    ctx.persisters[name] = PersisterRecord(
                        name=raw_name,
                        start_pos=start_pos,
                        end_pos=end_pos,
                        initial_value=initial_val,
                        current_value=initial_val,
                    )
                ctx.current_env.set(name, TextNode(initial_val))
                return ""
            entry = ctx.current_env.get(name)
            if entry is not None:
                return entry.evaluate(ctx) if isinstance(entry, ASTNode) else str(entry)
            return ""

        @self.register("v")
        def handle_v(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if not args:
                return ""
            name = args[0].value.evaluate(ctx).strip().lower()
            if len(args) > 1:
                val_str = args[1].value.evaluate(ctx)
                if name in ctx.persisters:
                    ctx.persisters[name].current_value = val_str
                ctx.current_env.set(name, TextNode(val_str))
                return ""
            if name in ctx.resolving_vars:
                return ""
            entry = ctx.current_env.get(name)
            if entry is not None:
                if isinstance(entry, ASTNode):
                    ctx.resolving_vars.add(name)
                    try:
                        return entry.evaluate(ctx)
                    finally:
                        ctx.resolving_vars.remove(name)
                return str(entry)
            if name in ctx.control_vars_by_name:
                return str(ctx.control_vars_by_name[name])
            if name in ctx.box_map:
                return ctx.parse_fragment(ctx.box_map[name])
            return ""

        # 2. Control Flow, Branching & Comparisons
        @self.register("?", "if")
        def handle_if(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if len(args) < 2:
                return ""
            cond_str = args[0].value.evaluate(ctx)
            is_truthy = _eval_condition(ctx, cond_str)
            if is_truthy:
                return args[1].value.evaluate(ctx)
            if len(args) > 2:
                return args[2].value.evaluate(ctx)
            return ""

        @self.register("eq", "=", "equal", "equals")
        def handle_eq(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if len(args) < 2:
                return "1"
            val1 = args[0].value.evaluate(ctx).strip()
            val2 = args[1].value.evaluate(ctx).strip()
            is_equal = _loose_equals(val1, val2)
            if len(args) == 2:
                return "1" if is_equal else "0"
            if is_equal:
                return args[2].value.evaluate(ctx)
            if len(args) > 3:
                return args[3].value.evaluate(ctx)
            return ""

        @self.register("!=", "ne", "neq")
        def handle_ne(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if len(args) < 2:
                return "0"
            val1 = args[0].value.evaluate(ctx).strip()
            val2 = args[1].value.evaluate(ctx).strip()
            is_not_equal = not _loose_equals(val1, val2)
            if len(args) == 2:
                return "1" if is_not_equal else "0"
            if is_not_equal:
                return args[2].value.evaluate(ctx)
            if len(args) > 3:
                return args[3].value.evaluate(ctx)
            return ""

        @self.register("c", "contains")
        def handle_c(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if not args:
                return "0"
            current_tape = "".join(ctx.rendered_stream).lower()
            target = args[0].value.evaluate(ctx).strip().lower()
            is_match = bool(target and target in current_tape)

            if len(args) == 1:
                return "1" if is_match else "0"
            if len(args) == 2:
                return args[1].value.evaluate(ctx) if is_match else ""
            return args[1].value.evaluate(ctx) if is_match else args[2].value.evaluate(ctx)

        @self.register("cycle", "next")
        def handle_cycle(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if len(args) < 2:
                return args[0].value.evaluate(ctx) if args else ""
            current = args[0].value.evaluate(ctx).strip().lower()
            items = [b.value.evaluate(ctx).strip() for b in args[1:]]
            if not items:
                return ""
            matched_idx = -1
            for idx, item in enumerate(items):
                if item.lower() == current:
                    matched_idx = idx
                    break
            if matched_idx == -1:
                return items[0]
            return items[(matched_idx + 1) % len(items)]

        @self.register("tape")
        def handle_tape(ctx: CanvasParser, args: List[BranchNode]) -> str:
            return "".join(ctx.rendered_stream)

        # 3. Math Engine & Direct Arithmetic Handlers
        def _execute_math_evaluation(ctx: CanvasParser, op_name: Optional[str], args: List[BranchNode], _precomputed: Optional[List[str]] = None) -> str:
            prev_math = ctx.in_math
            ctx.in_math = True
            raw_rendered_args = _precomputed if _precomputed is not None else None
            try:
                if raw_rendered_args is None:
                    raw_rendered_args = [b.value.evaluate(ctx) for b in args]
                inner_expr = "|".join(raw_rendered_args)
                raw_expr = f"{op_name}({inner_expr})" if op_name else inner_expr
                res, is_pure_float = _eval_math_core(raw_expr)
                if isinstance(res, bool):
                    return "1" if res else "0"
                if isinstance(res, str):
                    return res
                if is_pure_float:
                    return f"{float(res):.4f}".rstrip("0").rstrip(".") if "." in f"{float(res):.4f}" else str(float(res))
                return str(int(res))
            except Exception:
                # Reuse args we already evaluated above instead of re-running them,
                # so anything with a side effect (persister writes, -()/neg() calls,
                # random picks, etc.) only fires once even when math parsing fails.
                if raw_rendered_args is None:
                    raw_rendered_args = [b.value.evaluate(ctx) for b in args]
                rendered_args = "|".join(raw_rendered_args)
                return f"{op_name or 'm'}({rendered_args})"
            finally:
                ctx.in_math = prev_math

        @self.register("m", "calc", "math")
        def handle_m(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if not args:
                return "0"
            return _execute_math_evaluation(ctx, None, args)

        @self.register("+", "add")
        def handle_add(ctx: CanvasParser, args: List[BranchNode]) -> str:
            return _execute_math_evaluation(ctx, "+", args)

        @self.register("*", "mul")
        def handle_mul(ctx: CanvasParser, args: List[BranchNode]) -> str:
            return _execute_math_evaluation(ctx, "*", args)

        @self.register("/", "div")
        def handle_div(ctx: CanvasParser, args: List[BranchNode]) -> str:
            return _execute_math_evaluation(ctx, "/", args)

        @self.register("%", "mod")
        def handle_mod(ctx: CanvasParser, args: List[BranchNode]) -> str:
            return _execute_math_evaluation(ctx, "%", args)

        @self.register("^", "pow")
        def handle_pow(ctx: CanvasParser, args: List[BranchNode]) -> str:
            return _execute_math_evaluation(ctx, "^", args)

        # 4. Variadic Introspection
        @self.register("argc")
        def handle_argc(ctx: CanvasParser, args: List[BranchNode]) -> str:
            return str(len(ctx.arg_stack[-1])) if ctx.arg_stack else "0"

        @self.register("arg")
        def handle_arg(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if not args or not ctx.arg_stack:
                return ""
            try:
                idx = int(float(args[0].value.evaluate(ctx).strip()))
            except ValueError:
                return ""
            call_args = ctx.arg_stack[-1]
            if 0 <= idx < len(call_args):
                return call_args[idx][0]
            return ""

        @self.register("argw")
        def handle_argw(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if not ctx.arg_stack:
                return "1"
            idx = 0
            if args:
                try:
                    idx = int(float(args[0].value.evaluate(ctx).strip()))
                except ValueError:
                    return "1"
            call_args = ctx.arg_stack[-1]
            if 0 <= idx < len(call_args):
                wt = call_args[idx][1]
                return f"{wt:.4f}".rstrip("0").rstrip(".") if "." in f"{wt:.4f}" else str(wt)
            return "1"

        @self.register("argpick")
        def handle_argpick(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if not ctx.arg_stack:
                return "-1"
            call_args = ctx.arg_stack[-1]
            valid_idx, weights = [], []
            for idx, (_, wt) in enumerate(call_args):
                if wt > 0:
                    valid_idx.append(idx)
                    weights.append(wt)
            if not valid_idx or sum(weights) <= 0:
                return "-1"

            if ctx.current_driver is not None:
                try:
                    driven_idx = int(float(ctx.current_driver))
                    return str(valid_idx[driven_idx % len(valid_idx)])
                except ValueError:
                    pass

            rng = random.Random(f"{ctx.get_global_seed()}_{ctx.get_global_run()}_{ctx.step_counter}")
            ctx.step_counter += 1
            return str(rng.choices(valid_idx, weights=weights, k=1)[0])

        # 5. Source Resolution, Iteration & Randomness
        @self.register("i", "iter", "pick")
        def handle_i(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if not args:
                return ""
            pool = [b.value.evaluate(ctx) for b in args if b.value]
            if not pool:
                return ""
            run_val = ctx.get_driver_or_run()
            return pool[run_val % len(pool)]

        @self.register("n", "permute", "permutation")
        def handle_n(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if not args:
                return ""
            slots = [b.value for b in args]

            groups: List[InvocationNode] = []
            for slot in slots:
                _collect_option_groups(slot, groups)

            if not groups:
                # No (a|b|c) groups anywhere -- degrade to plain single-dimension
                # cycling over the top-level args, same as i().
                run_val = ctx.get_driver_or_run()
                return slots[run_val % len(slots)].evaluate(ctx)

            sizes = [len(g.args) for g in groups]
            total = 1
            for size in sizes:
                total *= size
            if total <= 0:
                return ""

            combo = ctx.get_driver_or_run() % total
            selections: Dict[int, int] = {}
            for group, size in zip(reversed(groups), reversed(sizes)):
                selections[id(group)] = combo % size
                combo //= size

            rendered = []
            for slot in slots:
                piece = _render_permutation_slot(slot, selections, ctx).strip()
                if piece:
                    rendered.append(piece)
            return " ".join(rendered)

        @self.register("pickline")
        def handle_pickline(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if not args:
                return ""
            val = args[0].value.evaluate(ctx).strip()
            if not val:
                return ""
            lines = ctx._fetch_list_source(val)
            if not lines:
                return val

            if ctx.current_driver is not None:
                try:
                    idx = int(float(ctx.current_driver))
                    return lines[idx % len(lines)]
                except ValueError:
                    pass

            rng = random.Random(f"{ctx.get_global_seed()}_{ctx.get_global_run()}_{ctx.step_counter}_{val}")
            ctx.step_counter += 1
            return rng.choice(lines)

        @self.register("w", "wildcard")
        def handle_w(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if not args:
                return ""
            if len(args) == 1:
                val = args[0].value.evaluate(ctx).strip()
                lines = ctx._fetch_list_source(val)
                if lines:
                    if ctx.current_driver is not None:
                        try:
                            idx = int(float(ctx.current_driver))
                            return lines[idx % len(lines)]
                        except ValueError:
                            pass
                    rng = random.Random(f"{ctx.get_global_seed()}_{ctx.get_global_run()}_{ctx.step_counter}_{val}")
                    ctx.step_counter += 1
                    return rng.choice(lines)
                return val

            evaluated = [(b.value.evaluate(ctx), b.weight if b.weight is not None else 1.0) for b in args]
            valid_pool = [(val, wt) for val, wt in evaluated if wt > 0]
            if not valid_pool:
                return ""

            if ctx.current_driver is not None:
                try:
                    idx = int(float(ctx.current_driver))
                    return valid_pool[idx % len(valid_pool)][0]
                except ValueError:
                    pass

            rng = random.Random(f"{ctx.get_global_seed()}_{ctx.get_global_run()}_{ctx.step_counter}")
            ctx.step_counter += 1

            vals = [p[0] for p in valid_pool]
            weights = [p[1] for p in valid_pool]
            return rng.choices(vals, weights=weights, k=1)[0]

        @self.register("r", "rand", "random")
        def handle_r(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if not args:
                return ""
            raw_parts = [b.value.evaluate(ctx).strip() for b in args if b.value.evaluate(ctx).strip()]
            if not raw_parts:
                return ""

            if ctx.current_driver is not None:
                try:
                    drv_num = float(ctx.current_driver)
                    seed_key = f"{drv_num}_{ctx.step_counter}"
                except ValueError:
                    seed_key = f"{ctx.get_global_seed()}_{ctx.get_global_run()}_{ctx.step_counter}"
            else:
                seed_key = f"{ctx.get_global_seed()}_{ctx.get_global_run()}_{ctx.step_counter}"

            ctx.step_counter += 1
            rng = random.Random(seed_key)

            try:
                is_float = any("." in p for p in raw_parts)
                if is_float:
                    f_vals = [float(p) for p in raw_parts]
                    min_v = f_vals[0]
                    max_v = f_vals[1] if len(f_vals) > 1 else min_v
                    if len(f_vals) == 1:
                        min_v, max_v = 0.0, min_v
                    if min_v > max_v:
                        min_v, max_v = max_v, min_v
                    res = rng.uniform(min_v, max_v)
                    return f"{res:.4f}".rstrip("0").rstrip(".") if "." in f"{res:.4f}" else str(res)
                else:
                    i_vals = [int(float(p)) for p in raw_parts]
                    min_v = i_vals[0]
                    max_v = i_vals[1] if len(i_vals) > 1 else min_v
                    if len(i_vals) == 1:
                        min_v, max_v = 0, min_v
                    if min_v > max_v:
                        min_v, max_v = max_v, min_v
                    return str(rng.randint(min_v, max_v))
            except Exception:
                return f"r({'|'.join(raw_parts)})"

        # 6. Model Directives & Prompt Routing
        @self.register("lora", "lra")
        def handle_lora(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if not args:
                return "lora()"
            name, m_wt, c_wt = "", 1.0, 1.0
            if len(args) > 1:
                name = args[0].value.evaluate(ctx).strip().strip("'\"")
                try:
                    m_wt = float(args[1].value.evaluate(ctx).strip() or 1.0)
                except ValueError:
                    m_wt = 1.0
                try:
                    c_wt = float(args[2].value.evaluate(ctx).strip() or m_wt) if len(args) > 2 else m_wt
                except ValueError:
                    c_wt = m_wt
            else:
                b = args[0]
                raw_text = b.value.evaluate(ctx).strip().strip("'\"")
                parts = [p.strip().strip("'\"") for p in raw_text.split(":") if p.strip()]
                if len(parts) == 1:
                    name = parts[0]
                    m_wt = b.weight if b.weight is not None else 1.0
                    c_wt = m_wt
                elif len(parts) == 2:
                    name = parts[0]
                    try:
                        m_wt = float(parts[1])
                    except ValueError:
                        m_wt = 1.0
                    c_wt = b.weight if b.weight is not None and b.weight != 1.0 else m_wt
                elif len(parts) >= 3:
                    name = parts[0]
                    try:
                        m_wt, c_wt = float(parts[1]), float(parts[2])
                    except ValueError:
                        m_wt, c_wt = 1.0, 1.0
            if name:
                ctx.loras_to_load.append((name, float(m_wt), float(c_wt)))
                return ""
            return f"lora({'|'.join(b.value.evaluate(ctx) for b in args)})"

        _NUMERIC_ARG_RE = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)")

        @self.register("neg", "-")
        def handle_neg(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if not args:
                return ""
            # Evaluate each argument exactly once and reuse the result below,
            # so a -() with side effects (persister writes, nested calls, etc.)
            # never fires twice regardless of which branch handles it.
            evaluated = [b.value.evaluate(ctx) for b in args]
            stripped = [v.strip() for v in evaluated]

            # Only treat -() as the subtraction operator when we're inside a math
            # context AND every argument is actually a plain number. Otherwise
            # (e.g. -(test), -(blurry)) it's the negative-prompt shorthand, no
            # matter where in the expression it happens to be nested.
            if ctx.in_math and all(_NUMERIC_ARG_RE.fullmatch(v) for v in stripped if v != ""):
                try:
                    return _execute_math_evaluation(ctx, "-", args, _precomputed=evaluated)
                except Exception:
                    pass

            chunks = [v for v in stripped if v]
            if chunks:
                ctx.negative_prompt_parts.append(", ".join(chunks))
            return ""

        @self.register("embed")
        def handle_embed(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if not args:
                return ""
            name = args[0].value.evaluate(ctx).strip().strip("'\"")
            wt = args[0].weight if args[0].weight is not None else 1.0
            if len(args) > 1:
                try:
                    wt = float(args[1].value.evaluate(ctx).strip())
                except ValueError:
                    pass
            return f"embedding:{name}:{wt}" if wt != 1.0 else f"embedding:{name}"

        @self.register("o")
        def handle_o(ctx: CanvasParser, args: List[BranchNode]) -> str:
            if not args:
                return "o()"
            raw_target = args[0].value.evaluate(ctx).strip().strip("'\"")
            filename = raw_target if raw_target.endswith(".txt") else f"{raw_target}.txt"
            path = os.path.join(ctx.textfiles_directory, os.path.basename(filename.replace("\\", "/")))
            if path in ctx.textfile_cache:
                return ctx.textfile_cache[path]
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        content = f.read()
                        ctx.textfile_cache[path] = content
                        return content
                except Exception:
                    pass
            return f"o({raw_target})"

        @self.register("mute", "h")
        def handle_mute(ctx: CanvasParser, args: List[BranchNode]) -> str:
            for b in args:
                b.value.evaluate(ctx)
            return ""