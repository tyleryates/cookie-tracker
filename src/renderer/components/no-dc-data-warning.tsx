import type { ComponentChildren } from 'preact';

export function NoDCDataWarning({ children }: { children: ComponentChildren }) {
  return (
    <div class="info-box info-box-warning">
      <p class="meta-text">
        <strong>No Digital Cookie Data</strong>
      </p>
      <p class="meta-text">
        {children}
        <br />
        Click the refresh button in the header to download Digital Cookie data.
      </p>
    </div>
  );
}
