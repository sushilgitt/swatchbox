/*
 * Swatchbox storefront renderer.
 *
 * Reads the JSON injected by snippets/swatchbox-config.liquid, finds the
 * native variant picker for the configured swatch option (Dawn / Online Store
 * 2.0 first), renders clickable color swatches, and drives the *theme's own*
 * variant logic by dispatching a real `change` event on the native control —
 * so price, availability, gallery image and ?variant= all update via the theme.
 *
 * Degrades safely: if no config or no picker is found, it does nothing and the
 * native dropdown is left untouched.
 */
(function () {
  "use strict";

  var INIT_FLAG = "swatchboxInit";

  function readData() {
    var el = document.getElementById("swatchbox-data");
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      return null;
    }
  }

  function norm(s) {
    return String(s == null ? "" : s).trim().toLowerCase();
  }

  // Find the add-to-cart form(s) on the page.
  function findProductForms() {
    var forms = document.querySelectorAll(
      'form[action*="/cart/add"], product-form form, form[id^="product-form"]'
    );
    return Array.prototype.slice.call(forms);
  }

  /*
   * Locate the native control for a given option within a form.
   * Returns { kind: 'select', el } or { kind: 'radio', name, inputs } or null.
   * Matches by option name on the control, then falls back to matching the
   * control whose values cover the configured swatch values.
   */
  function findOptionControl(form, optionName, wantedValues) {
    var nameKey = norm(optionName);
    var wanted = wantedValues.map(norm);

    // 1) <select> by name="options[Color]" or matching label/values.
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
      var covers = wanted.every(function (v) {
        return optVals.indexOf(v) !== -1;
      });
      if (byName || (wanted.length && covers)) {
        return { kind: "select", el: sel };
      }
    }

    // 2) radio groups: group radios by name, match by values.
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
      var covers2 = wanted.length
        ? wanted.every(function (v) {
            return vals.indexOf(v) !== -1;
          })
        : false;
      // also try matching by fieldset legend text
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

  function currentValue(control) {
    if (control.kind === "select") {
      return control.el.value;
    }
    for (var i = 0; i < control.inputs.length; i++) {
      if (control.inputs[i].checked) return control.inputs[i].value;
    }
    return null;
  }

  // Drive the native control + let the theme react.
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
        var match = norm(inp.value) === norm(value);
        if (match) {
          inp.checked = true;
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    }
  }

  function hideNativeControl(control) {
    var target = null;
    if (control.kind === "select") {
      target =
        control.el.closest(".select") ||
        control.el.closest(".product-form__input") ||
        control.el;
    } else {
      target =
        control.inputs[0].closest("fieldset") ||
        control.inputs[0].closest(".product-form__input");
    }
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

  function buildSwatches(config, settings, control, mountPoint) {
    var size = (config && config.size) || settings.size || 36;
    var shape = (config && config.shape) || settings.shape || "circle";

    var wrap = document.createElement("div");
    wrap.className = "swatchbox";
    wrap.setAttribute("data-option", config.swatchOption);

    var label = document.createElement("div");
    label.className = "swatchbox__label";
    var labelName = document.createElement("span");
    labelName.className = "swatchbox__label-name";
    labelName.textContent = config.swatchOption + ": ";
    var selectedSpan = document.createElement("span");
    selectedSpan.className = "swatchbox__selected";
    label.appendChild(labelName);
    label.appendChild(selectedSpan);
    wrap.appendChild(label);

    var list = document.createElement("div");
    list.className = "swatchbox__swatches";
    wrap.appendChild(list);

    var buttons = [];
    config.values.forEach(function (v) {
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
      if (v.type === "color" && v.hex) {
        fill.style.background = v.hex;
      } else if (v.imageUrl) {
        fill.style.backgroundImage = "url(" + v.imageUrl + ")";
        fill.style.backgroundSize = "cover";
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

    wrap._setActive = setActive;
    mountPoint.parentNode.insertBefore(wrap, mountPoint);
    setActive(currentValue(control));

    // keep swatch highlight in sync if the variant changes elsewhere
    var syncEl =
      control.kind === "select" ? control.el : control.inputs[0].form;
    if (syncEl) {
      syncEl.addEventListener("change", function () {
        setActive(currentValue(control));
      });
    }

    return wrap;
  }

  function renderForm(form, data) {
    if (form[INIT_FLAG]) return;
    var config = data.config;
    if (!config || !config.swatchOption || !config.values) return;

    var values = config.values.map(function (v) {
      return v.value;
    });
    var control = findOptionControl(form, config.swatchOption, values);
    if (!control) return; // degrade: leave native picker alone

    var mount =
      control.kind === "select"
        ? control.el.closest(".product-form__input") || control.el
        : control.inputs[0].closest(".product-form__input") ||
          control.inputs[0].closest("fieldset") ||
          control.inputs[0];

    buildSwatches(config, data.settings || {}, control, mount);
    hideNativeControl(control);
    form[INIT_FLAG] = true;
  }

  function run() {
    var data = readData();
    if (!data || !data.config) return;
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
    // Re-render on theme-editor section reloads / quick-add / AJAX swaps.
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
