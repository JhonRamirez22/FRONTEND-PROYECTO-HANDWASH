import { describe, expect, it } from 'vitest';
import { kioskGuideText } from '@/lib/KioskGuideCatalog';
import type { KioskGuide } from '@/types';

const guide = (codigo: KioskGuide['codigo']): KioskGuide => ({ codigo, paso: null, faltanteMs: null, tono: 'INFO' });

describe('kiosk copy for the end of a wash', () => {
  it('celebrates a finished wash plainly', () => {
    expect(kioskGuideText(guide('LAVADO_COMPLETO'))).toEqual({
      title: '¡Lavado exitoso!', detail: 'Los seis movimientos se completaron.',
    });
  });

  it('tells the person which way to go back when a wrong movement was held', () => {
    expect(kioskGuideText(guide('REINICIA_LAVADO'))).toEqual({
      title: 'Movimiento incorrecto: reinicia el lavado', detail: 'Empieza de nuevo con Palmas y sigue el orden.',
    });
  });
});
