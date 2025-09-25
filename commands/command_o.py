import os

def execute(parser, content, **kwargs):
    """
    Loads the content of an external text file and returns it for parsing.
    The file is expected to be in the 'user/textfiles' directory.
    """
    filename = content.strip()
    if not filename:
        return ""

    # Ensure the filename ends with .txt for security and consistency
    if not filename.endswith('.txt'):
        filename += '.txt'
    
    # Construct a safe path to the file
    filepath = os.path.join(parser.textfiles_directory, os.path.basename(filename))

    try:
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                # Return the file's content to be recursively resolved by the main parser
                return f.read()
        else:
            print(f"Thought Bubble Warning: o() command could not find file '{filename}'")
            return "" # Return empty string if file not found
    except Exception as e:
        print(f"Thought Bubble Error: o() command failed to read file '{filename}': {e}")
        return ""
