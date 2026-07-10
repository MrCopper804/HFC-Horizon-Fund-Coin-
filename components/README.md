# HFC Exchange Reusable Components Directory
This directory is reserved for modular, reusable Vanilla JS ES6 component classes. 

## Writing Custom Components
To maintain modularity and prevent file bloat, define custom widgets as standalone ES6 classes that render dynamically:

```js
export class MyWalletWidget {
  constructor(containerId, initialBalance = 0.0) {
    this.container = document.getElementById(containerId);
    this.balance = initialBalance;
    this.render();
  }

  updateBalance(newBalance) {
    this.balance = newBalance;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="card-glass card-wallet hover-glow rounded-lg">
        <span class="stat-label">Active Balance</span>
        <h4 class="stat-value text-glow-primary mt-2">${this.balance} USDT</h4>
      </div>
    `;
  }
}
```
