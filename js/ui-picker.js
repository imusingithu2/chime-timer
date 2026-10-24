/**
 * ui-picker.js
 * Custom scrolling wheel picker.
 */
export class Picker {
  constructor(element, options = {}) {
    this.el = element;
    this.min = options.min ?? 0;
    this.max = options.max ?? 59;
    this.value = options.initialValue ?? 0;
    this.onChange = options.onChange ?? (() => {});

    this.init();
  }

  init() {
    // Create items with padding to allow centering
    const items = [];
    for (let i = this.min; i <= this.max; i++) {
      const div = document.createElement('div');
      div.className = 'picker-item';
      div.textContent = i.toString().padStart(2, '0');
      items.push(div);
    }

    // Add spacers for top and bottom
    const spacer = document.createElement('div');
    spacer.className = 'picker-item';
    spacer.style.height = '110px'; // approx 2.5 items

    this.el.appendChild(spacer.cloneNode());
    items.forEach(item => this.el.appendChild(item));
    this.el.appendChild(spacer);

    this.el.addEventListener('scrollend', () => this.updateValue());
    this.el.addEventListener('scroll', () => {
      // Fallback for browsers without scrollend
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = setTimeout(() => this.updateValue(), 150);
    });

    this.scrollToValue(this.value);
  }

  scrollToValue(val) {
    const index = val - this.min;
    const offset = index * 44;
    this.el.scrollTop = offset;
  }

  updateValue() {
    const index = Math.round(this.el.scrollTop / 44);
    const newVal = this.min + index;
    if (newVal >= this.min && newVal <= this.max && newVal !== this.value) {
      this.value = newVal;
      this.onChange(this.value);
    }
  }

  getValue() {
    return this.value;
  }
}
