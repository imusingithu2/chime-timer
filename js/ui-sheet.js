/**
 * ui-sheet.js
 * Manages the bottom sheet.
 */
export class Sheet {
  constructor() {
    this.el = document.getElementById('sheet');
    this.backdrop = document.getElementById('sheet-backdrop');
    this.titleEl = document.getElementById('sheet-title');
    this.contentEl = document.getElementById('sheet-content');
    this.btnCancel = document.getElementById('sheet-btn-cancel');
    this.btnDone = document.getElementById('sheet-btn-done');

    this.onCancel = null;
    this.onDone = null;

    this.btnCancel.onclick = () => this.close();
    this.backdrop.onclick = () => this.close();
    this.btnDone.onclick = () => {
      if (this.onDone) this.onDone();
      this.close();
    };
  }

  open(title, contentHtml, options = {}) {
    this.titleEl.textContent = title;
    this.contentEl.innerHTML = contentHtml;
    this.onCancel = options.onCancel ?? null;
    this.onDone = options.onDone ?? null;

    this.backdrop.style.display = 'block';
    this.el.classList.add('open');
  }

  close() {
    this.el.classList.remove('open');
    this.backdrop.style.display = 'none';
    if (this.onCancel) this.onCancel();
  }
}

export const sheet = new Sheet();
