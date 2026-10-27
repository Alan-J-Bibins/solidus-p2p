import rawSource from '../../review-2-demo-raw/src/main.ts?raw';
import locData from './loc-data.json';
import solidusSource from './main.ts?raw';

export function renderLocSection(): void {
    const section = document.createElement('section');
    section.className = 'loc-section';
    section.innerHTML = `
      <h3>Line-count comparison</h3>
      <div class="loc-grid">
        <div class="loc-card"><span class="loc-value">${locData.withSolidus.code}</span><span class="loc-label">With Solidus</span></div>
        <div class="loc-card"><span class="loc-value">${locData.withoutSolidus.code}</span><span class="loc-label">Without Solidus</span></div>
        <div class="loc-card"><span class="loc-value">${locData.locSaved}</span><span class="loc-label">Lines saved</span></div>
        <div class="loc-card"><span class="loc-value">${locData.reductionPct.toFixed(1)}%</span><span class="loc-label">Reduction</span></div>
      </div>
      <div class="comparison-grid">
        <article class="code-panel solidus-panel">
          <div class="code-panel-head"><strong>With Solidus</strong><span class="line-badge">${locData.withSolidus.code} code lines · ${locData.withSolidus.total} total</span></div>
          <pre><code id="solidusCode"></code></pre>
        </article>
        <article class="code-panel raw-panel">
          <div class="code-panel-head"><strong>Without Solidus</strong><span class="line-badge">${locData.withoutSolidus.code} code lines · ${locData.withoutSolidus.total} total</span></div>
          <pre><code id="rawCode"></code></pre>
        </article>
      </div>
    `;

    document.querySelector<HTMLDivElement>('.container')!.append(section);
    section.querySelector('#solidusCode')!.textContent = solidusSource;
    section.querySelector('#rawCode')!.textContent = rawSource;
}
