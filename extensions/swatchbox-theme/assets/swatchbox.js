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
  var PROXY = null; // {global, library} fetched from the app proxy fallback
  var PROXY_TRIED = false;

  /* Fallback: fetch global+library from the app proxy if not injected inline. */
  function maybeProxy(data, rerun) {
    if (PROXY || PROXY_TRIED) return;
    if (!data || !(data.library === null || data.library === undefined)) return;
    PROXY_TRIED = true;
    try {
      fetch("/apps/swatchbox/swatch-config", {
        headers: { Accept: "application/json" },
      })
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (j) {
          if (j) {
            PROXY = j;
            rerun();
          }
        })
        .catch(function () {});
    } catch (e) {
      /* ignore */
    }
  }

  function mergeProxy(data) {
    if (data && PROXY) {
      if (data.library === null || data.library === undefined) {
        data.library = PROXY.library;
      }
      if (!data.global && PROXY.global) data.global = PROXY.global;
    }
    return data;
  }

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

  function optionIndex(optionName, data) {
    var names = (data.product && data.product.optionNames) || [];
    for (var i = 0; i < names.length; i++) {
      if (norm(names[i]) === norm(optionName)) return i;
    }
    return -1;
  }

  /* First variant that has `value` for `optionName`. */
  function variantForValue(value, optionName, data) {
    var idx = optionIndex(optionName, data);
    if (idx < 0) return null;
    var variants = (data.product && data.product.variants) || [];
    for (var v = 0; v < variants.length; v++) {
      var opts = variants[v].options || [];
      if (norm(opts[idx]) === norm(value)) return variants[v];
    }
    return null;
  }

  function variantImageFor(value, optionName, data) {
    var variant = variantForValue(value, optionName, data);
    return variant && variant.featuredImage ? variant.featuredImage : null;
  }

  /*
   * Aggregate inventory + price for an option value across every variant that
   * has it: available if ANY matching variant is available; qty is the summed
   * tracked inventory; price/sale come from the first matching variant.
   */
  function aggregateValue(value, optionName, data) {
    var idx = optionIndex(optionName, data);
    var variants = (data.product && data.product.variants) || [];
    var out = {
      anyAvailable: false,
      qty: 0,
      hasQty: false,
      priceFormatted: null,
      onSale: false,
    };
    var first = true;
    for (var v = 0; v < variants.length; v++) {
      var opts = variants[v].options || [];
      if (idx < 0 || norm(opts[idx]) !== norm(value)) continue;
      var vr = variants[v];
      if (first) {
        out.priceFormatted = vr.priceFormatted;
        out.onSale = !!(
          vr.compareAtPrice != null &&
          Number(vr.compareAtPrice) > Number(vr.price)
        );
        first = false;
      }
      if (vr.available) out.anyAvailable = true;
      if (typeof vr.inventoryQuantity === "number") {
        out.hasQty = true;
        if (vr.inventoryQuantity > 0) out.qty += vr.inventoryQuantity;
      }
    }
    // No matching variants (e.g. global-only render with a value not in data):
    // treat as available so we never hide a legitimate option.
    if (first) out.anyAvailable = true;
    return out;
  }

  /* A single low-stock line whose text follows the selected value. */
  function makeLowStock(values, settings) {
    var el = document.createElement("div");
    el.className = "swatchbox__lowstock";
    el.hidden = true;
    var byValue = {};
    values.forEach(function (v) {
      byValue[normName(v.value)] = v;
    });
    function update(value) {
      var v = byValue[normName(value)];
      var th = settings.lowStockThreshold || 0;
      if (v && v.available && th > 0 && v.qty > 0 && v.qty <= th) {
        el.textContent = (settings.lowStockMessage || "Only {qty} left!").replace(
          "{qty}",
          v.qty
        );
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    }
    return { el: el, update: update };
  }

  /* Should this value be skipped (hidden) given OOS settings? */
  function isHidden(v, settings) {
    return !v.available && settings.oosBehavior === "HIDE";
  }
  /* Should this value be disabled given OOS settings? */
  function isDisabled(v, settings) {
    return !v.available && settings.oosBehavior === "DISABLE";
  }

  /* Size-chart modal (lazy, removed on close / backdrop click). */
  function openSizeChart(url) {
    var existing = document.querySelector(".swatchbox__modal");
    if (existing) existing.remove();
    var overlay = document.createElement("div");
    overlay.className = "swatchbox__modal";
    var box = document.createElement("div");
    box.className = "swatchbox__modal-box";
    var close = document.createElement("button");
    close.type = "button";
    close.className = "swatchbox__modal-close";
    close.setAttribute("aria-label", "Close");
    close.innerHTML = "&times;";
    close.addEventListener("click", function () {
      overlay.remove();
    });
    var frame = document.createElement("iframe");
    frame.className = "swatchbox__modal-frame";
    frame.setAttribute("src", url);
    box.appendChild(close);
    box.appendChild(frame);
    overlay.appendChild(box);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  /*
   * Resolve each native value to a swatch. Precedence per value:
   *   variant_image (live variant image) -> explicit per-product -> library -> guess.
   */
  function resolveValues(values, spec, data) {
    var explicit = spec.explicit;
    var library = data.library;
    return values.map(function (cv) {
      var key = normName(cv.value);
      var ex = explicit ? explicit[key] : null;
      var type = (ex && ex.type) || spec.displayType || "color";

      if (type === "variant_image") {
        var img = variantImageFor(cv.value, spec.optionName, data);
        return img
          ? { value: cv.value, type: "image", imageUrl: img }
          : { value: cv.value, type: "color", hex: guessHex(cv.value) };
      }
      if (ex) {
        return {
          value: cv.value,
          type: ex.imageUrl ? "image" : ex.type || "color",
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

    var c = createWrap(optionName, "color", settings);
    var list = document.createElement("div");
    list.className = "swatchbox__swatches";
    c.wrap.appendChild(list);

    var buttons = [];
    values.forEach(function (v) {
      if (isHidden(v, settings)) return;
      var item = document.createElement("div");
      item.className = "swatchbox__item";

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatchbox__swatch";
      btn.setAttribute("data-value", v.value);
      btn.setAttribute("aria-label", v.value);
      btn.setAttribute("title", v.value);
      btn.style.setProperty("--sb-size", size + "px");
      btn.style.setProperty("--sb-radius", shapeRadius(shape, size));
      if (isDisabled(v, settings)) {
        btn.disabled = true;
        btn.classList.add("is-unavailable");
      }

      var fill = document.createElement("span");
      fill.className = "swatchbox__fill";
      if (v.imageUrl) {
        fill.style.backgroundImage = "url(" + v.imageUrl + ")";
        fill.style.backgroundSize = "cover";
      } else if (v.hex) {
        fill.style.background = v.hex;
      }
      btn.appendChild(fill);

      if (settings.showBadges && v.onSale) {
        var badge = document.createElement("span");
        badge.className = "swatchbox__badge";
        badge.textContent = "Sale";
        btn.appendChild(badge);
      }

      btn.addEventListener("click", function () {
        selectValue(control, v.value);
        setActive(v.value);
      });
      item.appendChild(btn);

      var cap = captionFor(v, settings);
      if (cap) item.appendChild(cap);

      list.appendChild(item);
      buttons.push({ value: v.value, el: btn });
    });

    var ls = makeLowStock(values, settings);
    c.wrap.appendChild(ls.el);

    function setActive(value) {
      c.selectedSpan.textContent = value || "";
      buttons.forEach(function (b) {
        var on = norm(b.value) === norm(value);
        b.el.setAttribute("aria-pressed", on ? "true" : "false");
        b.el.classList.toggle("is-active", on);
      });
      ls.update(value);
    }

    mount.parentNode.insertBefore(c.wrap, mount);
    setActive(currentValue(control));
    syncOnChange(control, setActive);
  }

  /* Shared: a wrapper with a "Option: <selected>" label + optional size chart. */
  function createWrap(optionName, modifier, settings) {
    var wrap = document.createElement("div");
    wrap.className = "swatchbox swatchbox--" + modifier;
    wrap.setAttribute("data-option", optionName);
    var label = document.createElement("div");
    label.className = "swatchbox__label";
    var nameEl = document.createElement("span");
    nameEl.className = "swatchbox__label-name";
    nameEl.textContent = optionName + ": ";
    var selectedSpan = document.createElement("span");
    selectedSpan.className = "swatchbox__selected";
    label.appendChild(nameEl);
    label.appendChild(selectedSpan);
    if (settings && settings.sizeChartUrl) {
      var sc = document.createElement("button");
      sc.type = "button";
      sc.className = "swatchbox__sizechart";
      sc.textContent = "Size chart";
      sc.addEventListener("click", function () {
        openSizeChart(settings.sizeChartUrl);
      });
      label.appendChild(sc);
    }
    wrap.appendChild(label);
    return { wrap: wrap, selectedSpan: selectedSpan };
  }

  /* Build the optional caption (value name + price) under a swatch/button. */
  function captionFor(v, settings) {
    if (!settings.showLabels && !(settings.showPrice && v.priceFormatted)) {
      return null;
    }
    var cap = document.createElement("span");
    cap.className = "swatchbox__caption";
    if (settings.showLabels) {
      var nm = document.createElement("span");
      nm.className = "swatchbox__cap-name";
      nm.textContent = v.value;
      cap.appendChild(nm);
    }
    if (settings.showPrice && v.priceFormatted) {
      var pr = document.createElement("span");
      pr.className = "swatchbox__cap-price";
      pr.textContent = v.priceFormatted;
      cap.appendChild(pr);
    }
    return cap;
  }

  function syncOnChange(control, setActive) {
    var syncEl = control.kind === "select" ? control.el : control.inputs[0].form;
    if (syncEl) {
      syncEl.addEventListener("change", function () {
        setActive(currentValue(control));
      });
    }
  }

  function buildButtons(optionName, values, settings, control, mount) {
    var c = createWrap(optionName, "buttons", settings);
    var list = document.createElement("div");
    list.className = "swatchbox__buttons";
    c.wrap.appendChild(list);

    var buttons = [];
    values.forEach(function (v) {
      if (isHidden(v, settings)) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatchbox__button";
      btn.setAttribute("data-value", v.value);
      if (isDisabled(v, settings)) {
        btn.disabled = true;
        btn.classList.add("is-unavailable");
      }

      var txt = document.createElement("span");
      txt.textContent = v.value;
      btn.appendChild(txt);
      if (settings.showPrice && v.priceFormatted) {
        var pr = document.createElement("span");
        pr.className = "swatchbox__btn-price";
        pr.textContent = v.priceFormatted;
        btn.appendChild(pr);
      }
      if (settings.showBadges && v.onSale) {
        var badge = document.createElement("span");
        badge.className = "swatchbox__badge swatchbox__badge--inline";
        badge.textContent = "Sale";
        btn.appendChild(badge);
      }

      btn.addEventListener("click", function () {
        selectValue(control, v.value);
        setActive(v.value);
      });
      list.appendChild(btn);
      buttons.push({ value: v.value, el: btn });
    });

    var ls = makeLowStock(values, settings);
    c.wrap.appendChild(ls.el);

    function setActive(value) {
      c.selectedSpan.textContent = value || "";
      buttons.forEach(function (b) {
        var on = norm(b.value) === norm(value);
        b.el.setAttribute("aria-pressed", on ? "true" : "false");
        b.el.classList.toggle("is-active", on);
      });
      ls.update(value);
    }

    mount.parentNode.insertBefore(c.wrap, mount);
    setActive(currentValue(control));
    syncOnChange(control, setActive);
  }

  function buildDropdown(optionName, values, settings, control, mount) {
    var c = createWrap(optionName, "dropdown", settings);
    var dd = document.createElement("div");
    dd.className = "swatchbox__dd";

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "swatchbox__dd-toggle";
    toggle.setAttribute("aria-expanded", "false");
    var current = document.createElement("span");
    current.className = "swatchbox__dd-current";
    var caret = document.createElement("span");
    caret.className = "swatchbox__dd-caret";
    caret.textContent = "▾";
    toggle.appendChild(current);
    toggle.appendChild(caret);

    var listEl = document.createElement("ul");
    listEl.className = "swatchbox__dd-list";
    listEl.hidden = true;

    var items = [];
    values.forEach(function (v) {
      if (isHidden(v, settings)) return;
      var li = document.createElement("li");
      var item = document.createElement("button");
      item.type = "button";
      item.className = "swatchbox__dd-item";
      item.setAttribute("data-value", v.value);
      if (isDisabled(v, settings)) {
        item.disabled = true;
        item.classList.add("is-unavailable");
      }
      if (v.hex || v.imageUrl) {
        var dot = document.createElement("span");
        dot.className = "swatchbox__dd-dot";
        if (v.imageUrl) {
          dot.style.background = "center/cover no-repeat url(" + v.imageUrl + ")";
        } else {
          dot.style.background = v.hex;
        }
        item.appendChild(dot);
      }
      var txt = document.createElement("span");
      txt.className = "swatchbox__dd-name";
      txt.textContent = v.value;
      item.appendChild(txt);
      if (settings.showPrice && v.priceFormatted) {
        var ddpr = document.createElement("span");
        ddpr.className = "swatchbox__dd-price";
        ddpr.textContent = v.priceFormatted;
        item.appendChild(ddpr);
      }
      if (settings.showBadges && v.onSale) {
        var ddbadge = document.createElement("span");
        ddbadge.className = "swatchbox__badge swatchbox__badge--inline";
        ddbadge.textContent = "Sale";
        item.appendChild(ddbadge);
      }
      item.addEventListener("click", function () {
        selectValue(control, v.value);
        setActive(v.value);
        close();
      });
      li.appendChild(item);
      listEl.appendChild(li);
      items.push({ value: v.value, el: item });
    });

    function open() {
      listEl.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
    }
    function close() {
      listEl.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    }
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      listEl.hidden ? open() : close();
    });
    document.addEventListener("click", close);

    var ls = makeLowStock(values, settings);

    function setActive(value) {
      current.textContent = value || "";
      items.forEach(function (it) {
        it.el.classList.toggle("is-active", norm(it.value) === norm(value));
      });
      ls.update(value);
    }

    dd.appendChild(toggle);
    dd.appendChild(listEl);
    c.wrap.appendChild(dd);
    c.wrap.appendChild(ls.el);
    mount.parentNode.insertBefore(c.wrap, mount);
    setActive(currentValue(control));
    syncOnChange(control, setActive);
  }

  /*
   * Decide which option(s) to render and how. Per-product config covers its own
   * option; global option-type mappings cover every other option (any type).
   */
  function getSpecs(data) {
    var specs = [];
    var seen = {};
    var cfg = data.config;
    if (cfg && cfg.swatchOption && cfg.values && cfg.values.length) {
      var explicit = {};
      cfg.values.forEach(function (v) {
        explicit[normName(v.value)] = v;
      });
      specs.push({
        optionName: cfg.swatchOption,
        displayType: cfg.displayType || "color",
        explicit: explicit,
      });
      seen[norm(cfg.swatchOption)] = true;
    }
    var global = data.global;
    if (global && global.optionTypes) {
      global.optionTypes.forEach(function (ot) {
        if (ot && ot.name && ot.type && !seen[norm(ot.name)]) {
          specs.push({ optionName: ot.name, displayType: ot.type, explicit: null });
          seen[norm(ot.name)] = true;
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

    var g = data.global || {};
    var s = data.settings || {};
    var settings = {
      shape: g.shape || s.shape || "circle",
      size: g.size || s.size || 36,
      showPrice: g.showPrice != null ? !!g.showPrice : !!s.showPrice,
      showLabels: !!g.showLabels,
      showBadges: g.showBadges !== false,
      sizeChartUrl: (data.config && data.config.sizeChartUrl) || null,
      oosBehavior: g.oosBehavior || "NONE",
      lowStockThreshold: g.lowStockThreshold || 0,
      lowStockMessage: g.lowStockMessage || "Only {qty} left!",
    };

    var rendered = 0;
    specs.forEach(function (spec) {
      var wanted = spec.explicit ? Object.keys(spec.explicit) : [];
      var control = findOptionControl(form, spec.optionName, wanted);
      if (!control) return;

      var resolved = resolveValues(controlValues(control), spec, data);
      if (!resolved.length) return;

      // Enrich each value with aggregated price, sale status, availability + qty.
      resolved.forEach(function (rv) {
        var agg = aggregateValue(rv.value, spec.optionName, data);
        rv.priceFormatted = agg.priceFormatted;
        rv.onSale = agg.onSale;
        rv.available = agg.anyAvailable;
        rv.qty = agg.qty;
      });

      var mount = mountPointFor(control);
      var dt = spec.displayType || "color";
      if (dt === "button") {
        buildButtons(spec.optionName, resolved, settings, control, mount);
      } else if (dt === "dropdown") {
        buildDropdown(spec.optionName, resolved, settings, control, mount);
      } else {
        buildSwatches(spec.optionName, resolved, settings, control, mount);
      }
      hideNativeControl(control);
      rendered++;
    });

    if (rendered > 0) form[INIT_FLAG] = true;
  }

  function run() {
    var data = mergeProxy(readData());
    if (!data) return;
    maybeProxy(data, tick);
    if (!data.config && !(data.global && data.global.optionTypes)) return;
    findProductForms().forEach(function (form) {
      try {
        renderForm(form, data);
      } catch (e) {
        /* never break the storefront */
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Collection / search pages: mini-swatches on product cards.
  // ---------------------------------------------------------------------------

  function readCollectionData() {
    var el = document.getElementById("swatchbox-collection");
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      return null;
    }
  }

  function resolveColorValue(value, opt, data) {
    var key = normName(value);
    if (opt.explicit && opt.explicit[key]) {
      var ex = opt.explicit[key];
      return { hex: ex.hex, imageUrl: ex.imageUrl, type: ex.type };
    }
    var lib = data.library && data.library[key];
    if (lib && (lib.hex || lib.imageUrl)) {
      return { hex: lib.hex, imageUrl: lib.imageUrl };
    }
    return { hex: guessHex(value) };
  }

  /* Pick the option to show as swatches on a card (config first, then global). */
  function cardSwatchOption(prod, data) {
    if (prod.config && prod.config.swatchOption) {
      var explicit = {};
      (prod.config.values || []).forEach(function (v) {
        explicit[normName(v.value)] = v;
      });
      return {
        name: prod.config.swatchOption,
        type: prod.config.displayType || "color",
        explicit: explicit,
      };
    }
    var ots = (data.global && data.global.optionTypes) || [];
    var names = prod.optionNames || [];
    for (var i = 0; i < ots.length; i++) {
      var ot = ots[i];
      if (!ot || !ot.name || !ot.type) continue;
      if (ot.type === "button" || ot.type === "dropdown") continue;
      for (var j = 0; j < names.length; j++) {
        if (norm(names[j]) === norm(ot.name)) {
          return { name: ot.name, type: ot.type, explicit: null };
        }
      }
    }
    return null;
  }

  /* Distinct values of the swatch option, each with a representative variant. */
  function cardValues(prod, opt, data) {
    var names = prod.optionNames || [];
    var idx = -1;
    for (var i = 0; i < names.length; i++) {
      if (norm(names[i]) === norm(opt.name)) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return [];
    var seen = {};
    var out = [];
    (prod.variants || []).forEach(function (v) {
      var val = (v.options || [])[idx];
      if (val == null) return;
      var key = normName(val);
      if (seen[key]) return;
      seen[key] = true;
      var rc = resolveColorValue(val, opt, data);
      var img = null;
      if (opt.type === "variant_image" || opt.type === "image") {
        img = v.featuredImage || rc.imageUrl || null;
      } else {
        img = rc.imageUrl || null;
      }
      out.push({
        value: val,
        hex: rc.hex,
        imageUrl: img,
        variantId: v.id,
        available: v.available,
        cardImage: v.featuredImage || null,
      });
    });
    return out;
  }

  function findCards() {
    var nodes = document.querySelectorAll(".card-wrapper");
    if (!nodes.length) nodes = document.querySelectorAll("li.grid__item, .grid__item");
    if (!nodes.length) nodes = document.querySelectorAll("[data-product-card]");
    return Array.prototype.slice.call(nodes);
  }

  function cardHandle(card) {
    var a = card.querySelector('a[href*="/products/"]');
    if (!a) return null;
    var m = (a.getAttribute("href") || "").match(/\/products\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  function makeCardSwatches(prod, values, settings) {
    var size = Math.min(settings.size || 28, 26);
    var container = document.createElement("div");
    container.className = "swatchbox-card";
    values.forEach(function (v) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "swatchbox-card__swatch";
      b.title = v.value;
      b.setAttribute("aria-label", v.value);
      b.style.setProperty("--sb-size", size + "px");
      var fill = document.createElement("span");
      fill.className = "swatchbox-card__fill";
      if (v.imageUrl) {
        fill.style.backgroundImage = "url(" + v.imageUrl + ")";
        fill.style.backgroundSize = "cover";
      } else if (v.hex) {
        fill.style.background = v.hex;
      }
      b.appendChild(fill);
      container.appendChild(b);
    });
    return container;
  }

  function renderCard(card, prod, data, settings) {
    if (card.swatchboxDone) return;
    var opt = cardSwatchOption(prod, data);
    if (!opt) return;
    var values = cardValues(prod, opt, data);
    if (values.length < 2) {
      card.swatchboxDone = true;
      return;
    }
    var img = card.querySelector("img");
    var link = card.querySelector('a[href*="/products/"]');
    var container = makeCardSwatches(prod, values, settings);

    container.querySelectorAll(".swatchbox-card__swatch").forEach(function (b, i) {
      var v = values[i];
      b.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (img && v.cardImage) img.src = v.cardImage;
        if (link && v.variantId) link.href = prod.url + "?variant=" + v.variantId;
        container
          .querySelectorAll(".swatchbox-card__swatch")
          .forEach(function (el) {
            el.classList.remove("is-active");
          });
        b.classList.add("is-active");
      });
    });

    var host =
      card.querySelector(".card__content") ||
      card.querySelector(".card-information") ||
      card;
    host.appendChild(container);
    card.swatchboxDone = true;
  }

  /* Experimental: clone the card per color value (off by default). */
  function splitCard(card, prod, data, settings) {
    var opt = cardSwatchOption(prod, data);
    if (!opt) return false;
    var values = cardValues(prod, opt, data);
    if (values.length < 2) return false;

    var clones = [];
    for (var i = 1; i < values.length; i++) {
      var clone = card.cloneNode(true);
      clone.swatchboxDone = true;
      applyValueToCard(clone, prod, values[i]);
      clones.push(clone);
    }
    applyValueToCard(card, prod, values[0]);
    card.swatchboxDone = true;

    var anchor = card;
    clones.forEach(function (clone) {
      if (anchor.nextSibling) {
        anchor.parentNode.insertBefore(clone, anchor.nextSibling);
      } else {
        anchor.parentNode.appendChild(clone);
      }
      anchor = clone;
    });
    return true;
  }

  function applyValueToCard(card, prod, v) {
    var img = card.querySelector("img");
    var link = card.querySelector('a[href*="/products/"]');
    if (img && v.cardImage) {
      img.src = v.cardImage;
      img.removeAttribute("srcset");
    }
    if (link && v.variantId) link.href = prod.url + "?variant=" + v.variantId;
  }

  function runCollection() {
    var data = mergeProxy(readCollectionData());
    if (!data) return;
    maybeProxy(data, tick);
    if (!data.global || !data.global.collectionSwatches) return;
    var products = data.products || {};
    var settings = {
      size: (data.settings && data.settings.size) || 36,
      shape: (data.settings && data.settings.shape) || "circle",
    };
    var split = !!data.global.splitByVariant;

    findCards().forEach(function (card) {
      try {
        if (card.swatchboxDone) return;
        var handle = cardHandle(card);
        if (!handle) return;
        var prod = products[handle];
        if (!prod) return;
        if (split) {
          if (!splitCard(card, prod, data, settings)) {
            renderCard(card, prod, data, settings);
          }
        } else {
          renderCard(card, prod, data, settings);
        }
      } catch (e) {
        /* never break the storefront */
      }
    });
  }

  function tick() {
    run();
    runCollection();
  }

  function boot() {
    tick();
    var mo = new MutationObserver(tick);
    mo.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("shopify:section:load", tick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
