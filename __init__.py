from .thought_bubble_node import ThoughtBubbleNode
from aiohttp import web
import server
import folder_paths
import os
import json
import struct

# --- Helper Functions for File Operations ---
user_dir = os.path.join(os.path.dirname(folder_paths.get_input_directory()), "user")
textfiles_directory = os.path.join(user_dir, "textfiles")
themes_directory = os.path.join(user_dir, "thoughtbubble_themes")
wildcards_directory = os.path.join(user_dir, "wildcards")
internal_themes_directory = os.path.join(os.path.dirname(__file__), "themes")

# NEW: Snippets storage file
snippets_filepath = os.path.join(user_dir, "thoughtbubble_snippets.json")

MAX_FILE_SIZE_MB = 5
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024


def ensure_user_directories():
    os.makedirs(textfiles_directory, exist_ok=True)
    os.makedirs(themes_directory, exist_ok=True)
    os.makedirs(wildcards_directory, exist_ok=True)


def is_path_safe(base_dir, filepath):
    try:
        abs_basedir = os.path.abspath(base_dir)
        abs_filepath = os.path.abspath(filepath)
        return os.path.commonpath([abs_filepath, abs_basedir]) == abs_basedir
    except ValueError:
        return False


# --- NEW: Snippet Endpoints ---
@server.PromptServer.instance.routes.get("/thoughtbubble/snippets/get")
async def get_snippets(request):
    ensure_user_directories()
    if not os.path.exists(snippets_filepath):
        # Default starting structure if no snippets exist yet
        return web.json_response({"Categories": {}})

    try:
        with open(snippets_filepath, "r", encoding="utf-8") as f:
            return web.json_response(json.load(f))
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/thoughtbubble/snippets/save")
async def save_snippets(request):
    ensure_user_directories()
    try:
        data = await request.json()
        with open(snippets_filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


# --- Existing Endpoints ---
@server.PromptServer.instance.routes.get("/loras")
async def get_loras(request):
    try:
        lora_names = folder_paths.get_filename_list("loras")
        return web.json_response(lora_names)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/thoughtbubble/lora_tags")
async def get_lora_tags(request):
    lora_name = request.query.get("name")
    if not lora_name:
        return web.json_response({"error": "No lora name provided"}, status=400)

    available_loras = folder_paths.get_filename_list("loras")
    matched_lora = next((l for l in available_loras if l.startswith(lora_name)), None)

    if not matched_lora:
        return web.json_response({"error": "LoRA not found"}, status=404)

    lora_path = folder_paths.get_full_path("loras", matched_lora)
    if not lora_path or not os.path.exists(lora_path):
        return web.json_response({"error": "LoRA file missing"}, status=404)

    tags_dict = {}
    try:
        with open(lora_path, "rb") as f:
            header_size_bytes = f.read(8)
            header_size = struct.unpack("<Q", header_size_bytes)[0]

            if header_size < 10000000:
                header_bytes = f.read(header_size)
                header_json = json.loads(header_bytes.decode("utf-8"))
                metadata = header_json.get("__metadata__", {})

                for key, value in metadata.items():
                    if key.startswith("ss_tag_frequency"):
                        if isinstance(value, str):
                            try:
                                tag_data = json.loads(value)
                                for dir_name, dir_tags in tag_data.items():
                                    for tag, count in dir_tags.items():
                                        clean_tag = tag.strip()
                                        if clean_tag:
                                            tags_dict[clean_tag] = (
                                                tags_dict.get(clean_tag, 0) + count
                                            )
                            except Exception:
                                pass
    except Exception as e:
        print(f"Thought Bubble: Error reading lora tags for {matched_lora}: {e}")

    tags_list = [{"name": k, "count": v} for k, v in tags_dict.items()]
    return web.json_response({"tags": tags_list})


@server.PromptServer.instance.routes.get("/embeddings")
async def get_embeddings(request):
    try:
        embedding_names = folder_paths.get_filename_list("embeddings")
        return web.json_response(embedding_names)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/thoughtbubble/textfiles")
async def get_text_files(request):
    ensure_user_directories()
    files = [f for f in os.listdir(textfiles_directory) if f.endswith(".txt")]
    return web.json_response(files)


@server.PromptServer.instance.routes.post("/thoughtbubble/save")
async def save_text_file(request):
    ensure_user_directories()
    try:
        data = await request.json()
        filename = data.get("filename")
        content = data.get("content")

        if not filename or not isinstance(filename, str):
            return web.json_response(
                {"error": "Filename is required and must be a string."}, status=400
            )

        if len(content.encode("utf-8")) > MAX_FILE_SIZE_BYTES:
            return web.json_response(
                {
                    "error": f"Content exceeds the maximum file size of {MAX_FILE_SIZE_MB}MB."
                },
                status=400,
            )

        secure_filename = os.path.basename(filename)
        if not secure_filename or not secure_filename.endswith(".txt"):
            return web.json_response(
                {
                    "error": "Invalid filename. It must not be empty and must end with .txt"
                },
                status=400,
            )

        filepath = os.path.join(textfiles_directory, secure_filename)
        if not is_path_safe(textfiles_directory, filepath):
            return web.json_response(
                {"error": "Invalid file path detected."}, status=403
            )

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        return web.json_response(
            {"success": True, "message": f"Saved to {secure_filename}"}
        )
    except json.JSONDecodeError:
        return web.json_response({"error": "Invalid JSON in request body."}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/thoughtbubble/load")
async def load_text_file(request):
    ensure_user_directories()
    filename = request.query.get("filename")
    if not filename:
        return web.json_response({"error": "Filename is required"}, status=400)

    secure_filename = os.path.basename(filename)
    filepath = os.path.join(textfiles_directory, secure_filename)

    if not os.path.exists(filepath):
        return web.json_response({"error": "File not found"}, status=404)
    if not is_path_safe(textfiles_directory, filepath):
        return web.json_response(
            {"error": "Access to the requested file path is forbidden."}, status=403
        )

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        return web.json_response({"content": content})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/thoughtbubble/wildcards")
async def get_wildcard_files(request):
    ensure_user_directories()
    files = [f for f in os.listdir(wildcards_directory) if f.endswith(".txt")]
    return web.json_response(files)


@server.PromptServer.instance.routes.post("/thoughtbubble/save_wildcard")
async def save_wildcard_file(request):
    ensure_user_directories()
    try:
        data = await request.json()
        filename = data.get("filename")
        content = data.get("content")

        if not filename or not isinstance(filename, str):
            return web.json_response(
                {"error": "Filename is required and must be a string."}, status=400
            )

        if len(content.encode("utf-8")) > MAX_FILE_SIZE_BYTES:
            return web.json_response(
                {
                    "error": f"Content exceeds the maximum file size of {MAX_FILE_SIZE_MB}MB."
                },
                status=400,
            )

        secure_filename = os.path.basename(filename)
        if not secure_filename or not secure_filename.endswith(".txt"):
            return web.json_response(
                {
                    "error": "Invalid filename. It must not be empty and must end with .txt"
                },
                status=400,
            )

        filepath = os.path.join(wildcards_directory, secure_filename)
        if not is_path_safe(wildcards_directory, filepath):
            return web.json_response(
                {"error": "Invalid file path detected."}, status=403
            )

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        return web.json_response(
            {"success": True, "message": f"Saved to {secure_filename}"}
        )
    except json.JSONDecodeError:
        return web.json_response({"error": "Invalid JSON in request body."}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/thoughtbubble/load_wildcard")
async def load_wildcard_file(request):
    ensure_user_directories()
    filename = request.query.get("filename")
    if not filename:
        return web.json_response({"error": "Filename is required"}, status=400)

    secure_filename = os.path.basename(filename)
    filepath = os.path.join(wildcards_directory, secure_filename)

    if not os.path.exists(filepath):
        return web.json_response({"error": "File not found"}, status=404)
    if not is_path_safe(wildcards_directory, filepath):
        return web.json_response(
            {"error": "Access to the requested file path is forbidden."}, status=403
        )

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        return web.json_response({"content": content})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/thoughtbubble/themes/list")
async def list_themes(request):
    ensure_user_directories()
    files = [
        f
        for f in os.listdir(themes_directory)
        if f.endswith(".json") and f != "default.json"
    ]
    return web.json_response(files)


@server.PromptServer.instance.routes.get("/thoughtbubble/themes/list_default")
async def list_default_themes(request):
    try:
        if not os.path.exists(internal_themes_directory):
            return web.json_response([])

        files = [
            f for f in os.listdir(internal_themes_directory) if f.endswith(".json")
        ]
        return web.json_response(files)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.post("/thoughtbubble/themes/save")
async def save_theme(request):
    ensure_user_directories()
    try:
        data = await request.json()
        filename = data.get("filename")
        content = data.get("content")
        secure_filename = os.path.basename(filename)

        if not secure_filename or not secure_filename.endswith(".json"):
            return web.json_response({"error": "Invalid filename."}, status=400)

        filepath = os.path.join(themes_directory, secure_filename)
        if not is_path_safe(themes_directory, filepath):
            return web.json_response({"error": "Invalid file path."}, status=403)

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(content, f)
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/thoughtbubble/themes/load")
async def load_theme(request):
    ensure_user_directories()
    filename = request.query.get("filename")
    secure_filename = os.path.basename(filename)

    user_filepath = os.path.join(themes_directory, secure_filename)
    internal_filepath = os.path.join(internal_themes_directory, secure_filename)

    filepath_to_load = None

    if os.path.exists(user_filepath) and is_path_safe(themes_directory, user_filepath):
        filepath_to_load = user_filepath
    elif os.path.exists(internal_filepath) and is_path_safe(
        internal_themes_directory, internal_filepath
    ):
        filepath_to_load = internal_filepath
    else:
        return web.json_response(
            {"error": "File not found or access denied."}, status=404
        )

    with open(filepath_to_load, "r", encoding="utf-8") as f:
        return web.json_response(json.load(f))


@server.PromptServer.instance.routes.post("/thoughtbubble/themes/default/set")
async def set_default_theme(request):
    ensure_user_directories()
    try:
        theme_data = await request.json()
        filepath = os.path.join(themes_directory, "default.json")
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(theme_data, f)
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/thoughtbubble/themes/default/get")
async def get_default_theme(request):
    ensure_user_directories()
    filepath = os.path.join(themes_directory, "default.json")
    if not os.path.exists(filepath):
        return web.json_response({"error": "No default theme set."}, status=404)

    with open(filepath, "r", encoding="utf-8") as f:
        return web.json_response(json.load(f))


# --- Node Mappings ---
NODE_CLASS_MAPPINGS = {"ThoughtBubbleNode": ThoughtBubbleNode}
NODE_DISPLAY_NAME_MAPPINGS = {"ThoughtBubbleNode": "Thought Bubble"}
WEB_DIRECTORY = "./js"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
