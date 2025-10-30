# **ThoughtBubble for ComfyUI 🧠**

**ThoughtBubble** is a custom node for ComfyUI that gives you a dynamic, visual, and node-based "whiteboard" to build and manage your prompts.

Stop trying to manage complex prompts in a single tiny text box! ThoughtBubble lets you break your ideas into logical pieces on an infinite canvas. You can build prompts by combining text boxes, create powerful wildcards with smart `ListBoxes`, and even set up complex conditional logic and loops using a simple command system.

![Thought Bubble Screenshot](./assets/thoughtbubblescreenshot.png)
![Basic Example](./assets/BasicSDXLIterationExample.png)

The above example image uses a 2D array to loop through 9 possible prompts. Conditional commands are use to parse the selected prompt from the text array to further control the output.


## **Features**

* **Visual Prompting:** Create, move, and resize "thought bubbles" on an infinite canvas. Pan, zoom, and organize your ideas visually.
* **Dynamic Commands:** Use a simple command syntax (`v()`, `w()`, `i()`, etc.) to reference other boxes, run logic, and build your prompt.
* **Powerful Box Types:**
    * **Text Box:** Your standard workhorse for prompt fragments.
    * **List Box:** A super-powered wildcard manager. Includes a toolbar to **Sort**, **Shuffle**, **Append Files**, and **Parse/Apply Weights** (`item:3`).
    * **Controls Box:** Create custom variables (e.g., counters, random seeds) to control your `i()` and `w()` commands for advanced loops and animations.
    * **Area Box:** Define regions for area conditioning (`a()`) with a visual canvas editor.
* **Full Wildcard Integration:** Use `w(filename)` or `i(filename)` to pull from your `ComfyUI/user/wildcards` text files.
* **ListBox as Wildcard:** Use a `ListBox` exactly like a text file! `w(my_list_box_title)` and `i(my_list_box_title)` work just as you'd expect.
* **Theming:** Customize the look and feel of your canvas. Save, load, and share your themes.
* **Autocomplete:** The editor automatically suggests `lora(...)`, `embed(...)`, and `o(...)` (text file) names as you type.

---

## **Installation**

1.  Navigate to your `ComfyUI/custom_nodes/` directory.
2.  Clone this repository: `git clone https://github.com/matthewfriedrichs/ComfyUI-ThoughtBubble.git`
3.  Restart ComfyUI.

---

## **How to Use (The Basics)**

1.  Add the **ThoughtBubble** node to your workflow (found in the "Workflow Efficiency" category).
2.  By default, the node will look for a box titled **`output`**. The content of this box is what will be sent as your final prompt.
3.  You can also **Maximize** (the `🗖` button) any other box to use its content as the `output` instead.

### Canvas Controls

* **Create a Box:** Double-click on the canvas to open the creation menu.
* **Create a Box (Quick):** Left-click and drag on an empty area to create a new box of the last selected type.
* **Move a Box:** Click and drag a box's header.
* **Resize a Box:** Click and drag the bottom-right corner of any box.
* **Pan Canvas:** Middle-click (or scroll-wheel click) and drag.
* **Zoom Canvas:** Use the scroll wheel.
* **Edit Title:** Double-click a box's title to rename it.

---

## **The Box Types**

### 1. Text Box (Default)
This is your standard box. Use it to write parts of your prompt, define reusable styles, or as the main `output` box.

* **Example:** Create a box titled `style` and put `cinematic, 4k, hyperrealistic` inside it. In your `output` box, you can then write `a cat, v(style)`.

### 2. List Box (Your Wildcard Manager)
This is the most powerful box type. Use it to create and manage lists of items, which can then be used just like wildcard files. It has a dedicated toolbar:

* **Shuffle:** Randomly shuffles all lines in the list.
* **Unique:** Removes all duplicate lines.
* **Weights:** Opens a modal to manage item weights. It **parses** `item:weight` syntax (like `red:3`, `blue:1`) to populate the inputs. You can then apply your changes back as duplicates (`red, red, red, blue`) or as syntax (`red:3`, `blue:1`).
* **Sort:** Opens a modal to sort the list alphabetically (A-Z or Z-A).
* **Append:** Opens a file browser to merge another list from your `user/wildcards` or `user/textfiles` folders. You can choose to add it to the beginning or end, and to automatically deduplicate the merged list.

### 3. Controls Box (Advanced Loops)
This box doesn't hold text. Instead, it lets you create stateful **variables** that control your commands.

1.  Create a "Controls" box (e.g., title `my_controls`).
2.  Click "+ Add Variable" and give it a name (e.g., `frame_counter`).
3.  Set its **Behavior**:
    * **Increment:** Adds 1 on every run.
    * **Decrement:** Subtracts 1 on every run.
    * **Randomize:** Generates a new large random number every run.
    * **Fixed:** Stays at the value you set.
4.  In any `i()` or `w()` command, you can link it to this variable. Just type `i(` or `w(` and a dropdown menu will appear, letting you select `my_controls / frame_counter`.
5.  Now, that specific `i()` command will be controlled by your `frame_counter` variable instead of the main node's iterator, allowing for multiple, independent loops in a single prompt.

### 4. Area Box (Regional Prompting)
This box is for **Area Conditioning**. It provides a visual canvas to define a region (X, Y, Width, Height, Strength) and a text area for the prompt you want to apply *only* to that region.

* To use it, create an Area Box, give it a title (e.g., `face_area`), and define your region and prompt.
* In your `output` box, use the `a()` command: `a beautiful woman a(face_area)`.

---

## **Main Toolbar**

At the top of the node is the main toolbar:

* **Save/Load:** Saves or loads text *from* the currently focused `TextBox` or `ListBox`.
    * `ListBox` content saves to/loads from `user/wildcards`.
    * `TextBox` content saves to/loads from `user/textfiles`.
* **Fit View:** Zooms and pans the canvas to show all your boxes.
* **Theme:** Opens the theme editor to customize all colors and fonts.
* **Grid:** Changes the size of the background grid.
* **Hide/Show Grid:** Toggles the grid visibility.
* **Periods = BREAK:** Toggles whether periods (`.`) are automatically converted to ComfyUI's `BREAK` keyword.
* **Hide/Show Map:** Toggles the mini-map in the bottom-right corner.
* **Run: 0 / Reset:** Shows the current run number (iterator). "Reset" sets it back to 0.

---

## **Core Commands (The Fun Part)**

Here are all the commands you can use inside any text or list box.

### **`v(...)` - Variables and Boxes**
The most fundamental command. It gets content from other boxes or variables.

* **Get Box Content:** `v(box_title)`
    * **Example:** `a beautiful v(subject)` will pull the text from the box named `subject`.
* **Define a Variable:** `v(var_name|value)`
    * **Example:** `v(my_color|red) a v(my_color) car` becomes `a red car`. The `v(my_color|red)` part becomes invisible.
* **Combine Boxes:** `v(box1 + box2)`
    * **Example:** `v(subject + style + location)`
* **Subtract/Toggle Boxes:** `v(box1 - box2)`
    * This "toggles" the content of `box2`. If `box2` contains positive prompts, they become negative. If it contains negative prompts (`-(ugly)`), they become positive (`ugly`).
    * **Example:** `v(positive_prompt - negative_prompt)`

### **`w(...)` - Wildcard (Random)**
Selects a **random** line from an inline list, a `ListBox`, or a `user/wildcards` file.

* **Inline List:** `w(red|green|blue)`
    * Picks one: `red`, `green`, or `blue`.
* **Weighted List:** `w(red:3|blue:1)`
    * `red` is 3x as likely to be chosen as `blue`.
* **ListBox / File:** `w(my_list_box)` or `w(my_wildcard_file)`
    * Picks one random line from the `ListBox` or file.
* **Mixed:** `w(my_list_box|a purple car|__other_wildcard__)`
    * Picks randomly from all three options. If `my_list_box` is chosen, it *then* picks a random line from inside it.

### **`i(...)` - Iterator (Sequential)**
Selects a line **sequentially** from a list, `ListBox`, or file. It uses the node's main "Run" counter or a linked **Controls Box** variable. It loops back to the start automatically.

* **Inline List:** `i(cat|dog|bird)`
    * Run 0: `cat`
    * Run 1: `dog`
    * Run 2: `bird`
    * Run 3: `cat`
* **Weighted List (Holds):** `i(cat:2|dog:1)`
    * Run 0: `cat`
    * Run 1: `cat` (holds for 2 runs)
    * Run 2: `dog`
    * Run 3: `cat`
* **ListBox / File:** `i(my_list_box)`
    * Sequentially steps through every line in the `ListBox` or file.
* **N-Dimensional (Combinations):**
    * **Syntax:** `i( (list_a) | (list_b) )`
    * **Example:** `i( (a|b) | (x|y) )`
        * Run 0: `ax`
        * Run 1: `ay`
        * Run 2: `bx`
        * Run 3: `by`
    * **Advanced Example:** `a i( (red|green) | (car|truck) | in the (day|night) )`
        * This will iterate through all 8 combinations (red car in the day, red car in the night, red truck in the day, ...).
    * **With ListBoxes:** `i( (my_colors_list) | (my_objects_list) )`
        * This is extremely powerful, iterating through every combination of your two lists.

### **`-(...)` - Negative Prompt**
Moves text from the positive prompt to the negative prompt.

* **Example:** `a beautiful painting -(ugly, deformed, bad hands)`
* **Final Positive:** `a beautiful painting`
* **Final Negative:** `ugly, deformed, bad hands`

### **`lora(...)` - Load LoRA**
Applies a LoRA. Autocomplete will help you find the name.

* **Syntax:** `lora(lora_name:model_strength)` or `lora(lora_name:model:clip)`
* **Example:** `lora(my_style_lora:0.8)`

### **`embed(...)` - Load Embedding**
Applies a Textual Inversion embedding. Autocomplete will help.

* **Syntax:** `embed(embedding_name)`
* **Example:** `embed(my_embedding)`

### **`o(...)` - Open Text File**
Loads text from a file in `user/textfiles`. This is useful for long, static prompt snippets.

* **Example:** `o(my_base_prompt)` will insert the full text from `my_base_prompt.txt`.

### **`a(...)` - Area Conditioning**
Applies the prompt from an **Area Box** to your main prompt.

* **Example:** `a detailed face a(face_area)`
* *Note: This command only works if you have an `Area Box` with the title `face_area`.*

### **`r(...)` - Random Number**
Generates a random number.

* **Syntax:** `r(max)` or `r(min|max)` or `r(min|max|decimals)`
* **Example 1 (Int):** `a stack of r(3|10) books` -> `a stack of 7 books`
* **Example 2 (Float):** `(a cat:r(0.8|1.2|1))` -> `(a cat:1.1)`

### **`?(...)` - If Statement**
A simple "if" statement. It checks the prompt *before* it for keywords. If the keywords are found, it outputs the "true" text, otherwise the "false" text.

* **Syntax:** `?(keyword:weight|text_if_true|text_if_false)`
* *Note: The "true" text is only output if the sum of weights of found keywords is >= 1.0. A keyword with no weight defaults to 1.0.*
* **Example:** `a photo of a cat. ?(cat|very cute|not a cat)`
    * **Output:** `a photo of a cat. very cute`
* **Weighted Example:** `a man with a hat ?(man:0.5, hat:0.5|wearing a hat|not wearing a hat)`
    * **Output:** `a man with a hat wearing a hat` (because 0.5 + 0.5 = 1.0)

### **`??(...)` - Multi-If Statement**
A "switch" or "if/else if/else" statement. It checks for multiple conditions in order and outputs the text for the *first* one that is true.

* **Syntax:** `??(cond_1:text_1|cond_2:text_2|default_text)`
* **Example:** `a red car ??(red:is red|blue:is blue|is some other color)`
    * **Output:** `a red car is red`

### **`h(...)` - Hidden Text**
Hides text from the final prompt. This is useful for leaving comments or running `v()` set commands.

* **Example:** `a red car h(this is a test) h(v(my_var|blue))`
* **Output:** `a red car` (but `my_var` is now set to `blue`).