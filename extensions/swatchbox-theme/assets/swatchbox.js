/*
 * Swatchbox storefront renderer.
 *
 * Reads the JSON injected by snippets/swatchbox-config.liquid and renders
 * swatches over the native variant picker, driving the theme's own variant
 * logic via a real `change` event.
 *
 * Config precedence:
 *   1. Per-product config  ($app:swatchbox/config on the product)  — explicit.
 *   2. Global option-types + color library ($app:swatchbox/global + /color_library)
 *      — renders color swatches for any option mapped to "color" (e.g. "Color"),
 *      resolving each value from the library, then a name guess.
 *
 * Degrades safely: no config + no global mapping, or no detectable picker -> does
 * nothing, native dropdown untouched.
 */
(function () {
  "use strict";

  var INIT_FLAG = "swatchboxInit";

  var COLOR_GUESS = {
    white: "#ffffff", black: "#000000", grey: "#808080", gray: "#808080",
    silver: "#c0c0c0", charcoal: "#36454f", ivory: "#fffff0", cream: "#fffdd0",
    beige: "#f5f5dc", tan: "#d2b48c", khaki: "#c3b091", brown: "#8b4513",
    camel: "#c19a6b", red: "#ff0000", crimson: "#dc143c", maroon: "#800000",
    burgundy: "#800020", wine: "#722f37", rose: "#ff007f", pink: "#ffc0cb",
    fuchsia: "#ff00ff", magenta: "#ff00ff", coral: "#ff7f50", salmon: "#fa8072",
    orange: "#ffa500", rust: "#b7410e", peach: "#ffe5b4", gold: "#ffd700",
    yellow: "#ffff00", mustard: "#e1ad01", green: "#008000", olive: "#808000",
    lime: "#bfff00", mint: "#98ff98", teal: "#008080", forest: "#228b22",
    emerald: "#50c878", sage: "#9caf88", blue: "#0000ff", navy: "#000080",
    royal: "#4169e1", sky: "#87ceeb", turquoise: "#40e0d0", cyan: "#00ffff",
    aqua: "#00ffff", indigo: "#4b0082", purple: "#800080", violet: "#8f00ff",
    lavender: "#e6e6fa", plum: "#8e4585", denim: "#1560bd"
  };

  function norm(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }
  function normName(s) {
    return norm(s).replace(/\s+/g, " ");
  }
  function guessHex(name) {
    var k = normName(name);
    if (COLOR_GUESS[k]) return COLOR_GUESS[k];
    var words = k.split(/[\s/-]+/).filter(Boolean);
    for (var i = words.length - 1; i >= 0; i--) {
      if (COLOR_GUESS[words[i]]) return COLOR_GUESS[words[i]];
    }
    return "#cccccc";
  }

  function readData() {
    var el = document.getElementById("swatchbox-data");
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      return null;
    }
  }

  function findProductForms() {
    var forms = document.querySelectorAll(
      'form[action*="/cart/add"], product-form form, form[id^="product-form"]'
    );
    return Array.prototype.slice.call(forms);
  }

  /* Locate the native control for an option. Returns {kind, ...} or null. */
  function findOptionControl(form, optionName, wantedValues) {
    var nameKey = norm(optionName);
    var wanted = (wantedValues || []).map(norm);

    var selects = form.querySelectorAll("select");
    for (var i = 0; i < selects.length; i++) {
      var sel = selects[i];
      var selName = norm(sel.getAttribute("name"));
      var byName =
        selName.indexOf("[" + nameKey + "]") !== -1 ||
        norm(sel.dataset ? sel.dataset.optionName : "") === nameKey;
      var optVals = Array.prototype.map.call(sel.options, function (o) {
        return norm(o.value);
      });
      var covers =
        wanted.length > 0 &&
        wanted.every(function (v) {
          return optVals.indexOf(v) !== -1;
        });
      if (byName || covers) return { kind: "select", el: sel };
    }

    var radios = form.querySelectorAll('input[type="radio"]');
    var groups = {};
    for (var r = 0; r < radios.length; r++) {
      var radio = radios[r];
      var gname = radio.getAttribute("name") || "";
      (groups[gname] = groups[gname] || []).push(radio);
    }
    for (var g in groups) {
      if (!Object.prototype.hasOwnProperty.call(groups, g)) continue;
      var inputs = groups[g];
      var vals = inputs.map(function (inp) {
        return norm(inp.value);
      });
      var covers2 =
        wanted.length > 0 &&
        wanted.every(function (v) {
          return vals.indexOf(v) !== -1;
        });
      var legendMatch = false;
      var fs = inputs[0].closest("fieldset");
      if (fs) {
        var legend = fs.querySelector("legend");
        if (legend && norm(legend.textContent).indexOf(nameKey) !== -1) {
          legendMatch = true;
        }
      }
      if (covers2 || legendMatch) {
        return { kind: "radio", name: g, inputs: inputs };
      }
    }
    return null;
  }

  function controlValues(control) {
    if (control.kind === "select") {
      return Array.prototype.map
        .call(control.el.options, function (o) {
          return { value: o.value, label: (o.textContent || o.value).trim() };
        })
        .filter(function (o) {
          return norm(o.value) !== "";
        });
    }
    return control.inputs.map(function (inp) {
      return {
        value: inp.value,
        label: inp.getAttribute("aria-label") || inp.value,
      };
    });
  }

  function currentValue(control) {
    if (control.kind === "select") return control.el.value;
    for (var i = 0; i < control.inputs.length; i++) {
      if (control.inputs[i].checked) return control.inputs[i].value;
    }
    return null;
  }

  function selectValue(control, value) {
    if (control.kind === "select") {
      var sel = control.el;
      for (var i = 0; i < sel.options.length; i++) {
        if (norm(sel.options[i].value) === norm(value)) {
          sel.selectedIndex = i;
          break;
        }
      }
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      for (var j = 0; j < control.inputs.length; j++) {
        var inp = control.inputs[j];
        if (norm(inp.value) === norm(value)) {
          inp.checked = true;
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    }
  }

  function hideNativeControl(control) {
    var target =
      control.kind === "select"
        ? control.el.closest(".select") ||
          control.el.closest(".product-form__input") ||
          control.el
        : control.inputs[0].closest("fieldset") ||
          control.inputs[0].closest(".product-form__input");
    if (target) {
      target.setAttribute("data-swatchbox-hidden", "true");
      target.style.display = "none";
    }
  }

  function shapeRadius(shape, size) {
    if (shape === "square") return "0";
    if (shape === "rounded") return Math.round(size * 0.22) + "px";
    return "50%";
  }

  /* Resolve each native value to a swatch (explicit map -> library -> guess). */
  function resolveValues(values, explicit, library) {
    return values.map(function (cv) {
      var key = normName(cv.value);
      if (explicit && explicit[key]) {
        var ex = explicit[key];
        return {
          value: cv.value,
          type: ex.type || (ex.imageUrl ? "image" : "color"),
          hex: ex.hex,
          imageUrl: ex.imageUrl,
        };
      }
      if (library && library[key] && (library[key].hex || library[key].imageUrl)) {
        var lib = library[key];
        return {
          value: cv.value,
          type: lib.imageUrl ? "image" : "color",
          hex: lib.hex,
          imageUrl: lib.imageUrl,
        };
      }
      return { value: cv.value, type: "color", hex: guessHex(cv.value) };
    });
  }

  function buildSwatches(optionName, values, settings, control, mount) {
    var size = settings.size || 36;
    var shape = settings.shape || "circle";

    var wrap = document.createElement("div");
    wrap.className = "swatchbox";
    wrap.setAttribute("data-option", optionName);

    var label = document.createElement("div");
    label.className = "swatchbox__label";
    var labelName = document.createElement("span");
    labelName.className = "swatchbox__label-name";
    labelName.textContent = optionName + ": ";
    var selectedSpan = document.createElement("span");
    selectedSpan.className = "swatchbox__selected";
    label.appendChild(labelName);
    label.appendChild(selectedSpan);
    wrap.appendChild(label);

    var list = document.createElement("div");
    list.className = "swatchbox__swatches";
    wrap.appendChild(list);

    var buttons = [];
    values.forEach(function (v) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatchbox__swatch";
      btn.setAttribute("data-value", v.value);
      btn.setAttribute("aria-label", v.value);
      btn.setAttribute("title", v.value);
      btn.style.setProperty("--sb-size", size + "px");
      btn.style.setProperty("--sb-radius", shapeRadius(shape, size));

      var fill = document.createElement("span");
      fill.className = "swatchbox__fill";
      if (v.imageUrl) {
        fill.style.backgroundImage = "url(" + v.imageUrl + ")";
        fill.style.backgroundSize = "cover";
      } else if (v.hex) {
        fill.style.background = v.hex;
      }
      btn.appendChild(fill);

      btn.addEventListener("click", function () {
        selectValue(control, v.value);
        setActive(v.value);
      });

      list.appendChild(btn);
      buttons.push({ value: v.value, el: btn });
    });

    function setActive(value) {
      selectedSpan.textContent = value || "";
      buttons.forEach(function (b) {
        var on = norm(b.value) === norm(value);
        b.el.setAttribute("aria-pressed", on ? "true" : "false");
        b.el.classList.toggle("is-active", on);
      });
    }

    mount.parentNode.insertBefore(wrap, mount);
    setActive(currentValue(control));

    var syncEl = control.kind === "select" ? control.el : control.inputs[0].form;
    if (syncEl) {
      syncEl.addEventListener("change", function () {
        setActive(currentValue(control));
      });
    }
  }

  /* Decide which option(s) to render as swatches. */
  function getSpecs(data) {
    var specs = [];
    var cfg = data.config;
    if (cfg && cfg.swatchOption && cfg.values && cfg.values.length) {
      var explicit = {};
      cfg.values.forEach(function (v) {
        explicit[normName(v.value)] = v;
      });
      specs.push({ optionName: cfg.swatchOption, explicit: explicit });
      return specs; // per-product wins outright
    }
    var global = data.global;
    if (global && global.optionTypes) {
      global.optionTypes.forEach(function (ot) {
        if (ot && ot.type === "color" && ot.name) {
          specs.push({ optionName: ot.name, explicit: null });
        }
      });
    }
    return specs;
  }

  function mountPointFor(control) {
    if (control.kind === "select") {
      return control.el.closest(".product-form__input") || control.el;
    }
    return (
      control.inputs[0].closest(".product-form__input") ||
      control.inputs[0].closest("fieldset") ||
      control.inputs[0]
    );
  }

  function renderForm(form, data) {
    if (form[INIT_FLAG]) return;
    var specs = getSpecs(data);
    if (!specs.length) return;

    var settings = {
      shape:
        (data.global && data.global.shape) ||
        (data.settings && data.settings.shape) ||
        "circle",
      size:
        (data.global && data.global.size) ||
        (data.settings && data.settings.size) ||
        36,
    };

    var rendered = 0;
    specs.forEach(function (spec) {
      var wanted = spec.explicit ? Object.keys(spec.explicit) : [];
      var control = findOptionControl(form, spec.optionName, wanted);
      if (!control) return;

      var resolved = resolveValues(
        controlValues(control),
        spec.explicit,
        data.library
      );
      if (!resolved.length) return;

      buildSwatches(
        spec.optionName,
        resolved,
        settings,
        control,
        mountPointFor(control)
      );
      hideNativeControl(control);
      rendered++;
    });

    if (rendered > 0) form[INIT_FLAG] = true;
  }

  function run() {
    var data = readData();
    if (!data) return;
    if (!data.config && !(data.global && data.global.optionTypes)) return;
    findProductForms().forEach(function (form) {
      try {
        renderForm(form, data);
      } catch (e) {
        /* never break the storefront */
      }
    });
  }

  function boot() {
    run();
    var mo = new MutationObserver(function () {
      run();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("shopify:section:load", run);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
