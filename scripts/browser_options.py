import os

def browser_options():
    options = {"headless": True}
    executable = os.environ.get("CHROMIUM_PATH")
    if executable:
        options["executable_path"] = executable
    else:
        options["channel"] = os.environ.get("BROWSER_CHANNEL", os.environ.get("PIXELHUB_BROWSER", "chrome"))
    return options
