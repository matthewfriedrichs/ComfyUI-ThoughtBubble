# **ThoughtBubble for ComfyUI**

ThoughtBubble is a custom node for ComfyUI that provides an interactive canvas to build and manage your prompts in a more visual and organized way. Think of it as a whiteboard for your ideas, allowing you to link different concepts, create conditional logic, and dynamically generate prompts using a powerful set of commands.

---

## **Features**

* **Visual Prompting**: Ditch the single text box. Create, move, and resize "thought bubbles" on an infinite canvas.
* **Dynamic Commands**: Use a simple yet powerful command syntax to reference other boxes, create negative prompts, use wildcards, and even implement conditional logic.
* **LoRA Autocomplete**: The editor will automatically suggest LoRA names as you type `lora(...)`.
* **Wildcard Support**: Integrates with a `user/wildcards` directory to pull random lines from your own text files.
* **Seedable Randomness**: The `seed` input on the node ensures that any random choices (from wildcards or random number generation) are repeatable.
* **Area Conditioning**: Create special "area" boxes to apply prompts to specific regions of your image, giving you fine-grained control over your composition.

---

![Thought Bubble](./assets/thoughtbubblescreenshot.png)

## **Installation**

1.  Navigate to your `ComfyUI/custom_nodes/` directory.
2.  Clone this repository: `git clone https://github.com/matthewfriedrichs/ComfyUI-ThoughtBubble.git`
3.  Restart ComfyUI.

---

## **How to Use**

1.  Add the **ThoughtBubble** node to your workflow (it can be found in the "Workflow Efficiency" category).
2.  The node provides a large canvas widget. You can:
    * **Create a box**: Left-click and drag on an empty area of the canvas, or double-click to open a creation menu.
    * **Move a box**: Click and drag the header of any box.
    * **Resize a box**: Click and drag the bottom-right corner of any box.
    * **Pan the canvas**: Middle-click (or scroll-wheel click) and drag.
    * **Zoom**: Use the scroll wheel.
3.  By default, the content of the box titled "**output**" will be used to generate the final prompt. You can also maximize any other box to use its content as the source instead.

---

## **Commands (The Core Feature)**

The power of ThoughtBubble comes from its command parser. You can type these commands into any text box to dynamically generate parts of your prompt.

### **`v(box_title)` \- Variable/Box Reference**

This is the most fundamental command. It fetches the content of another box.

* **Syntax**: `v(title_of_another_box)`
* **Example**: If you have a box titled `character` with the content "a wizard", you can write `A portrait of v(character)` in another box. This will resolve to "A portrait of a wizard".

---

### **`-(text)` \- Negative Prompt**

This command moves text from the positive prompt to the negative prompt.

* **Syntax**: `-(text to make negative)`
* **Example**: `beautiful painting -(ugly, deformed)` will result in:
    * **Positive Prompt**: "beautiful painting"
    * **Negative Prompt**: "ugly, deformed"

---

### **`w(wildcard)` \- Wildcard**

Selects a random line from either an inline list or a file in your `ComfyUI/user/wildcards` folder.

* **Syntax (Inline List)**: `w(option1 | option2 | option3)`
* **Syntax (File)**: `w(filename_without_extension)`
* **Example (Inline)**: `A painting of a w(cat | dog | dragon)` might become "A painting of a dog".
* **Example (File)**: If you have a file `ComfyUI/user/wildcards/colors.txt` containing "red", "green", and "blue" on separate lines, `a w(colors) car` might become "a blue car".

---

### **`r(min|max)` or `r(max)` \- Random Number**

Generates a random integer or float within a specified range.

* **Syntax**: `r(max)` or `r(min|max)`
* **Example (Integer)**: `A stack of r(10) books` will generate a number between 0 and 10\. `r(5|10)` will generate a number between 5 and 10\.
* **Example (Float)**: `(photo:r(0.8|1.2))` will generate a random weight between 0.8 and 1.2.

---

### **`lora(name:model_strength:clip_strength)` \- Apply LoRA**

Loads a LoRA with a specific strength. The node includes a helpful autocomplete dropdown for this command.

* **Syntax**: `lora(lora_name:strength)` or `lora(lora_name:model_strength:clip_strength)`
* **Example**: `A beautiful woman lora(epiCRealism:0.8)`

---

### **`a(box_title)` - Area Conditioning**

This powerful command applies the prompt from a special "area" box to a specific region of the generated image. This allows for detailed compositional control.

* **Syntax**: `a(title_of_area_box)`
* **How it Works**:
    1.  Create a new box and change its type to "area" (you can do this by double-clicking on the canvas and selecting "Create area").
    2.  Give the area box a unique title (e.g., "foreground object").
    3.  Inside the area box, you'll find a canvas to define the region and a text area for the prompt you want to apply to that region.
    4.  In your `output` box (or any other box that's part of your main prompt), include `a(foreground object)`.
* **Example**:
    * **Area Box Title**: `dragon`
        * **Area Prompt**: `a majestic red dragon`
        * *(You would also draw a rectangle on the canvas inside this box to define where the dragon should appear)*
    * **Output Box**: `a fantasy landscape, a(dragon)`

This will generate a fantasy landscape and then apply the prompt "a majestic red dragon" specifically to the area you defined in the "dragon" box.

---

### **`?(keywords|text_if_true|text_if_false)` \- Conditional**

Checks if any of the given keywords appear in the already-processed part of the prompt. If so, it inserts the "true" text; otherwise, it inserts the "false" text.

* **Syntax**: `?(keyword1, keyword2 | text if found | text if not found)`
* **Example**: `A w(forest|city) background. ?(forest|many trees|skyscrapers)`
    * If the wildcard chooses "forest", the prompt becomes: "A forest background. many trees"
    * If the wildcard chooses "city", the prompt becomes: "A city background. skyscrapers"

---

### **`??(keywords1:output1|keywords2:output2)` \- Multi-Conditional**

A more advanced conditional that allows for multiple checks. It works like a series of `if/else if` statements.

* **Syntax**: `??(key1,key2:output_if_found | key3:another_output | ...)`
* **Example**: `A w(cat|dog|bird). ??(cat:whiskers|dog:a wagging tail|bird:feathers)`

---

### **Advanced Commands**

* **`h(text)` \- Hidden Text**: The text inside `h()` is processed for commands but is hidden from the final output. This is useful for setting up conditions for `?()` or `??()` without adding text to the prompt.
* **`f(text)` \- Force Resolution**: Forces the parser to re-evaluate the text inside, which is useful for complex nested commands.

---

## **Example Workflow**

Let's combine some commands. Imagine you have the following boxes:

1.  **Box Title**: `subject`
    * **Content**: `A painting of a w(king|queen)`
2.  **Box Title**: `details`
    * **Content**: `h(v(subject)) ?(king|wearing a crown, beard|wearing a tiara, elegant)`
3.  **Box Title**: `lora_style`
    * **Content**: `lora(epiCRealism:r(0.7|0.9))`
4.  **Box Title**: `output`
    * **Content**: `v(subject), v(details), v(lora_style) -(blurry, cartoon)`

If the seed causes `w(king)` to be chosen, the final prompts would be:

* **Positive**: "A painting of a king, wearing a crown, beard" (plus the LoRA loaded)
* **Negative**: "blurry, cartoon"

If "queen" was chosen, it would be:

* **Positive**: "A painting of a queen, wearing a tiara, elegant"
* **Negative**: "blurry, cartoon"

This setup allows you to create highly dynamic and complex prompts that can be changed with just a single seed value. Happy prompting!
