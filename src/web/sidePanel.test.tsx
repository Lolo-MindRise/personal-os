import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SidePanel } from './SidePanel.js';

const noop = () => undefined;

describe('SidePanel', () => {
  it('renders nothing while closed', () => {
    expect(
      renderToStaticMarkup(
        <SidePanel open={false} title="Añadir hito" onClose={noop}>
          <p>contenido</p>
        </SidePanel>,
      ),
    ).toBe('');
  });

  it('is a labelled modal dialog with a close button when open', () => {
    const html = renderToStaticMarkup(
      <SidePanel open title="Añadir hito" onClose={noop}>
        <p>contenido</p>
      </SidePanel>,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Añadir hito"');
    expect(html).toContain('>Cerrar<');
    expect(html).toContain('<p>contenido</p>');
  });
});
