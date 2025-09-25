import re

def execute(parser, content, **kwargs):
    parts = parser._split_toplevel_options(content)
    if len(parts) == 2:
        find_clause, replace_text = parts[0].strip(), parts[1].strip()
        
        # Split the find clause by '&' to separate target words from condition words
        find_parts = [p.strip() for p in find_clause.split('&')]
        target_text = find_parts[0]
        condition_words = find_parts[1:] # The rest are conditions

        final_fuzzy_words = []
        cursor = 0
        while cursor < len(target_text):
            if target_text[cursor].isspace():
                cursor += 1
                continue
            
            group_match = re.match(r'\s*\(([^)]+?)(?::(\d*\.?\d+))?\)', target_text[cursor:])
            if group_match:
                words, thresh_str = group_match.groups()
                cursor += group_match.end()
            else:
                word_match = re.match(r'\s*([\w-]+)(?::(\d*\.?\d+))?', target_text[cursor:])
                if not word_match:
                    cursor += 1
                    continue
                words, thresh_str = word_match.groups()
                cursor += word_match.end()

            threshold = 100
            if thresh_str:
                raw = float(thresh_str)
                threshold = int(raw * 100) if raw < 1.0 else int(raw)
            
            final_fuzzy_words.extend((word.strip(), threshold) for word in words.split() if word)

        if final_fuzzy_words:
            # Append the new structure with condition_words
            parser.replacements.append((final_fuzzy_words, replace_text, condition_words))
    return ""
