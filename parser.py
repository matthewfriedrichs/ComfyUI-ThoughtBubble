# filename: thoughtbubble/parser.py

import re
from . import commands


class Node:
    def execute(self, parser, context=""):
        raise NotImplementedError


class TextNode(Node):
    def __init__(self, text):
        self.text = text

    def execute(self, parser, context=""):
        return self.text


class CompositeNode(Node):
    def __init__(self, children=None):
        self.children = children or []

    def execute(self, parser, context=""):
        results = []
        current_context = context or ""
        for child in self.children:
            child_result = child.execute(parser, context=current_context)
            results.append(child_result)
            current_context += child_result
        return "".join(results)


class CommandNode(Node):
    def __init__(self, command_name, arguments):
        self.command_name = command_name.lower()
        self.arguments = arguments

    def execute(self, parser, context=""):
        handler_name = f"{self.command_name.upper()}_COMMAND"
        handler = parser.command_handlers.get(handler_name)
        if handler:
            return handler(parser, self.arguments, context=context)
        args_str = "|".join(
            [arg.execute(parser, context=context) for arg in self.arguments]
        )
        return f"{self.command_name}({args_str})"


class CanvasParser:
    def __init__(
        self,
        box_map,
        wildcard_data,
        textfiles_directory,
        rng,
        iterator=0,
        control_vars_by_id=None,
        control_vars_by_name=None,
        command_links=None,
        textfile_cache=None,
        period_is_break=True,
    ):
        self.box_map = {k.lower(): v for k, v in box_map.items()}
        self.wildcards = wildcard_data
        self.textfiles_directory = textfiles_directory
        self.rng = rng
        self.iterator = iterator
        self.variables = {}
        self.control_vars_by_id = control_vars_by_id or {}
        self.control_vars_by_name = control_vars_by_name or {}
        self.period_is_break = period_is_break
        self.loras_to_load = []
        self.areas_to_apply = []
        self.scheduled_prompts = []

        self.command_handlers = {
            "A_COMMAND": commands.command_area.execute,
            "EQ_COMMAND": commands.command_eq.execute,
            "H_COMMAND": commands.command_h.execute,
            "I_COMMAND": commands.command_i.execute,
            "IF_COMMAND": commands.command_if.execute,
            "LORA_COMMAND": commands.command_lora.execute,
            "LRA_COMMAND": commands.command_lora.execute,
            "EMBED_COMMAND": commands.command_embed.execute,
            "MULTI_IF_COMMAND": commands.command_multi_if.execute,
            "NEG_COMMAND": commands.command_neg.execute,
            "O_COMMAND": commands.command_o.execute,
            "R_COMMAND": commands.command_r.execute,
            "T_COMMAND": commands.command_t.execute,
            "V_COMMAND": commands.command_v.execute,
            "W_COMMAND": commands.command_w.execute,
        }

        self.syntax_map = {
            "a": "A_COMMAND",
            "area": "A_COMMAND",
            "eq": "EQ_COMMAND",
            "=": "EQ_COMMAND",
            "h": "H_COMMAND",
            "i": "I_COMMAND",
            "if": "IF_COMMAND",
            "?": "IF_COMMAND",
            "lora": "LORA_COMMAND",
            "lra": "LORA_COMMAND",
            "embed": "EMBED_COMMAND",
            "multi_if": "MULTI_IF_COMMAND",
            "??": "MULTI_IF_COMMAND",
            "neg": "NEG_COMMAND",
            "-": "NEG_COMMAND",
            "o": "O_COMMAND",
            "r": "R_COMMAND",
            "t": "T_COMMAND",
            "v": "V_COMMAND",
            "w": "W_COMMAND",
        }

        sorted_keys = sorted(self.syntax_map.keys(), key=len, reverse=True)
        escaped_keys = [re.escape(k) for k in sorted_keys]
        cmd_pattern = "|".join([f"{k}\(" for k in escaped_keys])
        self.token_pattern = re.compile(f"({cmd_pattern})|(\|)|(\))|(\()")

    def parse(self, text):
        self.variables = {}
        self.loras_to_load = []
        self.areas_to_apply = []
        self.scheduled_prompts = []
        return self.parse_fragment(text, is_root=True)

    def parse_fragment(self, text, is_root=False, context=""):
        tokens = self._tokenize(text)
        root_children, _ = self._build_tree(tokens, terminators=[])
        root = CompositeNode(root_children)
        resolved_text = root.execute(self, context=context)
        if is_root:
            return self._post_process(resolved_text)
        return resolved_text

    def _tokenize(self, text):
        result = []
        last_pos = 0
        for match in self.token_pattern.finditer(text):
            if match.start() > last_pos:
                result.append(text[last_pos : match.start()])
            result.append(match.group())
            last_pos = match.end()
        if last_pos < len(text):
            result.append(text[last_pos:])
        return result

    def _build_tree(self, token_stream, terminators):
        children = []
        current_text_buffer = []
        paren_depth = 0

        def flush_text():
            if current_text_buffer:
                children.append(TextNode("".join(current_text_buffer)))
                current_text_buffer.clear()

        while token_stream:
            token = token_stream.pop(0)

            if token == "(":
                paren_depth += 1
                current_text_buffer.append(token)
            elif token == ")":
                if paren_depth > 0:
                    paren_depth -= 1
                    current_text_buffer.append(token)
                elif ")" in terminators:
                    flush_text()
                    return children, "CLOSE_PAREN"
                else:
                    current_text_buffer.append(token)
            elif token == "|":
                if paren_depth > 0:
                    current_text_buffer.append(token)
                elif "|" in terminators:
                    flush_text()
                    return children, "SEPARATOR"
                else:
                    current_text_buffer.append(token)
            elif token.endswith("(") and len(token) > 1:
                flush_text()
                raw_syntax = token[:-1]
                cmd_key = self.syntax_map.get(raw_syntax)
                normalized_name = cmd_key.replace("_COMMAND", "").lower()

                arguments = []
                while True:
                    arg_children, reason = self._build_tree(
                        token_stream, terminators=["|", ")"]
                    )
                    arguments.append(CompositeNode(arg_children))
                    if reason == "CLOSE_PAREN":
                        break
                    elif reason is None:
                        break

                children.append(CommandNode(normalized_name, arguments))
            else:
                current_text_buffer.append(token)

        flush_text()
        return children, None

    def _post_process(self, text):
        positive_toggled_content = []

        def extract_and_remove_neg_toggles(match):
            neg_content = match.group(1)

            def process_toggle(toggle_match):
                toggled_word = toggle_match.group(1)
                positive_toggled_content.append(toggled_word.replace("_", " "))
                return ""

            new_neg_content = re.sub(
                r"!\s*([a-zA-Z0-9_]+)", process_toggle, neg_content
            )
            return f"###NEG###{new_neg_content}###/NEG###"

        toggled_text = re.sub(
            r"###NEG###(.*?)###/NEG###",
            extract_and_remove_neg_toggles,
            text,
            flags=re.DOTALL,
        )

        def handle_pos_to_neg_toggle(match):
            toggled_word = match.group(1)
            processed_word = toggled_word.replace("_", " ")
            return f"###NEG###{processed_word}###/NEG###"

        toggled_text = re.sub(
            r"!\s*([a-zA-Z0-9_]+)", handle_pos_to_neg_toggle, toggled_text
        )

        # 1. Extract Negatives
        negative_prompt_raw_parts = re.findall(
            r"###NEG###(.*?)###/NEG###", toggled_text, re.DOTALL
        )
        negative_prompt = " ".join(
            part.strip() for part in negative_prompt_raw_parts if part.strip()
        )

        # 2. Remove Negatives from Positive Text
        text_without_neg = re.sub(
            r"###NEG###.*?###/NEG###", "", toggled_text, flags=re.DOTALL
        )

        # 3. NEW: Remove Hidden Blocks (###HIDDEN_START### ... ###HIDDEN_END###)
        # We do this AFTER extracting negatives so that h(!neg) still works.
        text_without_hidden = re.sub(
            r"###HIDDEN_START###.*?###HIDDEN_END###",
            "",
            text_without_neg,
            flags=re.DOTALL,
        ).strip()

        base_positive_text = text_without_hidden
        full_positive_text = (
            base_positive_text + " " + " ".join(positive_toggled_content)
        )

        break_tagged_positive_prompt = full_positive_text
        if self.period_is_break:

            def protect_decimal(match):
                return match.group(0).replace(".", "###DECIMAL_PROTECT###", 1)

            break_tagged_positive_prompt = re.sub(
                r"\d\.\d", protect_decimal, full_positive_text
            )
            break_tagged_positive_prompt = break_tagged_positive_prompt.replace(
                ".", " ###PERIOD_BREAK_TAG### "
            )
            break_tagged_positive_prompt = break_tagged_positive_prompt.replace(
                "###DECIMAL_PROTECT###", "."
            )

        positive_prompt = ", ".join(
            filter(
                None,
                [
                    p.strip()
                    for p in re.sub(r"\s+", " ", break_tagged_positive_prompt)
                    .strip()
                    .split(",")
                ],
            )
        )
        if self.period_is_break:
            positive_prompt = positive_prompt.replace(
                "###PERIOD_BREAK_TAG###", " BREAK "
            )

        negative_prompt = ", ".join(
            filter(
                None,
                [
                    p.strip()
                    for p in re.sub(r"\s+", " ", negative_prompt).strip().split(",")
                ],
            )
        )
        return positive_prompt, negative_prompt
