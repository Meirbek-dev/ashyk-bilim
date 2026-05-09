import type { Plugins, Schema, Template } from '@pdfme/common';
import QRCode from 'qrcode';

type CertificationPattern =
  | 'academic'
  | 'geometric'
  | 'minimal'
  | 'modern'
  | 'nature'
  | 'professional'
  | 'royal'
  | 'tech'
  | 'vintage'
  | 'waves'
  | string;

interface CertificatePdfLabels {
  authenticityGuaranteed: string;
  awarded: string;
  badgeCheckIcon: string;
  certificate: string;
  certificateId: string;
  instructor: string;
  verificationNote: string;
}

interface CertificatePdfData {
  awardedDate: string;
  certificateId: string;
  certificationDescription: string;
  certificationName: string;
  certificationTypeLabel: string;
  instructor?: string | null;
  labels: CertificatePdfLabels;
  pattern: CertificationPattern;
  verificationUrl: string;
}

interface PatternTheme {
  badgeBackground: string;
  infoBackground: string;
  infoBorder: string;
  primary: string;
  secondary: string;
}

const A4_LANDSCAPE = {
  width: 297,
  height: 210,
} as const;

let pdfmePlugins: Plugins | null = null;

const ROBOTO_FONT = {
  Roboto: {
    data: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5WZLCzYlKw.ttf',
    fallback: true,
  },
  RobotoMedium: {
    data: 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmEU9vAx05IsDqlA.ttf',
  },
  RobotoBold: {
    data: 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlvAx05IsDqlA.ttf',
  },
} as const;

const getPatternTheme = (pattern: CertificationPattern): PatternTheme => {
  const colors = (() => {
    switch (pattern) {
      case 'academic': {
        return { primary: '#3730a3', secondary: '#4338ca' };
      }
      case 'geometric': {
        return { primary: '#7c3aed', secondary: '#9333ea' };
      }
      case 'minimal': {
        return { primary: '#374151', secondary: '#4b5563' };
      }
      case 'nature': {
        return { primary: '#15803d', secondary: '#16a34a' };
      }
      case 'professional': {
        return { primary: '#334155', secondary: '#475569' };
      }
      case 'royal': {
        return { primary: '#b45309', secondary: '#d97706' };
      }
      case 'tech': {
        return { primary: '#0e7490', secondary: '#0891b2' };
      }
      case 'vintage': {
        return { primary: '#c2410c', secondary: '#ea580c' };
      }
      case 'waves':
      case 'modern': {
        return { primary: '#1d4ed8', secondary: '#2563eb' };
      }
      default: {
        return { primary: '#374151', secondary: '#4b5563' };
      }
    }
  })();

  return {
    ...colors,
    badgeBackground: mixHex(colors.secondary, '#ffffff', 0.12),
    infoBackground: '#f9fafb',
    infoBorder: mixHex(colors.secondary, '#ffffff', 0.28),
  };
};

const mixHex = (foreground: string, background: string, foregroundWeight: number) => {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);

  return rgbToHex({
    r: Math.round(fg.r * foregroundWeight + bg.r * (1 - foregroundWeight)),
    g: Math.round(fg.g * foregroundWeight + bg.g * (1 - foregroundWeight)),
    b: Math.round(fg.b * foregroundWeight + bg.b * (1 - foregroundWeight)),
  });
};

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized, 16);

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const rgbToHex = ({ r, g, b }: { b: number; g: number; r: number }) =>
  `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;

const rectangle = (
  name: string,
  position: Schema['position'],
  width: number,
  height: number,
  color: string,
  options: Partial<Schema> & { borderColor?: string; borderWidth?: number; radius?: number } = {},
): Schema => ({
  name,
  type: 'rectangle',
  position,
  width,
  height,
  color,
  borderColor: options.borderColor ?? '',
  borderWidth: options.borderWidth ?? 0,
  opacity: options.opacity ?? 1,
  radius: options.radius ?? 0,
  readOnly: true,
  rotate: options.rotate ?? 0,
});

const text = (
  name: string,
  position: Schema['position'],
  width: number,
  height: number,
  options: {
    alignment?: 'center' | 'left' | 'right';
    characterSpacing?: number;
    color?: string;
    content?: string;
    dynamicFontSize?: { fit: 'horizontal' | 'vertical'; max: number; min: number };
    fontName?: 'Roboto' | 'RobotoBold' | 'RobotoMedium';
    fontSize: number;
    lineHeight?: number;
    readOnly?: boolean;
    verticalAlignment?: 'bottom' | 'middle' | 'top';
  },
): Schema => ({
  name,
  type: 'text',
  content: options.content,
  position,
  width,
  height,
  alignment: options.alignment ?? 'left',
  backgroundColor: '',
  characterSpacing: options.characterSpacing ?? 0,
  dynamicFontSize: options.dynamicFontSize,
  fontColor: options.color ?? '#111827',
  fontName: options.fontName ?? 'Roboto',
  fontSize: options.fontSize,
  lineHeight: options.lineHeight ?? 1.2,
  opacity: 1,
  readOnly: options.readOnly ?? false,
  verticalAlignment: options.verticalAlignment ?? 'top',
});

const inputText = (
  name: string,
  position: Schema['position'],
  width: number,
  height: number,
  options: Parameters<typeof text>[4],
) => text(name, position, width, height, { ...options, readOnly: false });

const image = (name: string, position: Schema['position'], width: number, height: number): Schema => ({
  name,
  type: 'image',
  position,
  width,
  height,
  opacity: 1,
  readOnly: false,
  rotate: 0,
});

const cornerSchemas = (theme: PatternTheme): Schema[] => {
  const size = 35;
  const inset = 24;
  const thickness = 1.4;
  const right = A4_LANDSCAPE.width - inset - size;
  const bottom = A4_LANDSCAPE.height - inset - size;

  return [
    rectangle('cornerTopLeftHorizontal', { x: inset, y: inset }, size, thickness, theme.secondary),
    rectangle('cornerTopLeftVertical', { x: inset, y: inset }, thickness, size, theme.secondary),
    rectangle('cornerTopRightHorizontal', { x: right, y: inset }, size, thickness, theme.secondary),
    rectangle('cornerTopRightVertical', { x: right + size - thickness, y: inset }, thickness, size, theme.secondary),
    rectangle(
      'cornerBottomLeftHorizontal',
      { x: inset, y: bottom + size - thickness },
      size,
      thickness,
      theme.secondary,
    ),
    rectangle('cornerBottomLeftVertical', { x: inset, y: bottom }, thickness, size, theme.secondary),
    rectangle(
      'cornerBottomRightHorizontal',
      { x: right, y: bottom + size - thickness },
      size,
      thickness,
      theme.secondary,
    ),
    rectangle(
      'cornerBottomRightVertical',
      { x: right + size - thickness, y: bottom },
      thickness,
      size,
      theme.secondary,
    ),
  ];
};

const buildTemplate = (data: CertificatePdfData): Template => {
  const theme = getPatternTheme(data.pattern);
  const hasInstructor = Boolean(data.instructor);
  const infoIdY = hasInstructor ? 178 : 169;

  const schemas: Schema[] = [
    ...cornerSchemas(theme),
    rectangle('idBox', { x: 25, y: 25 }, 96, 18, '#f9fafb', {
      borderColor: '#f3f4f6',
      borderWidth: 0.4,
      radius: 2,
    }),
    rectangle('idAccent', { x: 25, y: 25 }, 1.6, 18, theme.secondary),
    text('certificateIdLabel', { x: 30, y: 29 }, 85, 4, {
      content: data.labels.certificateId,
      color: '#6b7280',
      fontName: 'RobotoMedium',
      fontSize: 7,
      characterSpacing: 0.35,
      readOnly: true,
    }),
    inputText('certificateId', { x: 30, y: 35 }, 85, 6, {
      color: theme.primary,
      fontName: 'RobotoBold',
      fontSize: 8,
      dynamicFontSize: { min: 5, max: 8, fit: 'horizontal' },
    }),
    rectangle('qrBorder', { x: 241, y: 22 }, 32, 32, '#ffffff', {
      borderColor: theme.secondary,
      borderWidth: 1,
      radius: 2,
    }),
    image('qrCode', { x: 246, y: 27 }, 22, 22),
    text('qrLabel', { x: 221, y: 56 }, 72, 4, {
      content: data.labels.authenticityGuaranteed,
      alignment: 'center',
      color: '#6b7280',
      fontName: 'RobotoMedium',
      fontSize: 5.5,
      readOnly: true,
    }),
    rectangle('headerLineLeft', { x: 95, y: 61 }, 34, 0.9, theme.secondary),
    rectangle('headerDiamond', { x: 146.5, y: 59.5 }, 3.8, 3.8, theme.primary, {
      borderColor: theme.secondary,
      borderWidth: 0.3,
      rotate: 45,
    }),
    rectangle('headerLineRight', { x: 168, y: 61 }, 34, 0.9, theme.secondary),
    text('certificateTitle', { x: 65, y: 67 }, 167, 7, {
      content: data.labels.certificate,
      alignment: 'center',
      characterSpacing: 1.2,
      color: theme.primary,
      fontName: 'RobotoBold',
      fontSize: 12,
      readOnly: true,
    }),
    rectangle('badgeBackground', { x: 88, y: 82 }, 121, 15, theme.badgeBackground, {
      borderColor: theme.secondary,
      borderWidth: 0.9,
      radius: 7.5,
    }),
    text('badgeCheckIcon', { x: 96, y: 86 }, 8, 6, {
      content: data.labels.badgeCheckIcon,
      alignment: 'center',
      color: theme.primary,
      fontName: 'RobotoBold',
      fontSize: 11,
      readOnly: true,
      verticalAlignment: 'middle',
    }),
    inputText('certificationTypeLabel', { x: 106, y: 86 }, 94, 6, {
      alignment: 'center',
      characterSpacing: 0.25,
      color: theme.primary,
      dynamicFontSize: { min: 6, max: 9, fit: 'horizontal' },
      fontName: 'RobotoBold',
      fontSize: 9,
      verticalAlignment: 'middle',
    }),
    inputText('certificationName', { x: 38, y: 106 }, 221, 18, {
      alignment: 'center',
      color: theme.primary,
      dynamicFontSize: { min: 12, max: 22, fit: 'vertical' },
      fontName: 'RobotoBold',
      fontSize: 22,
      lineHeight: 1.15,
      verticalAlignment: 'middle',
    }),
    inputText('certificationDescription', { x: 58, y: 128 }, 181, 16, {
      alignment: 'center',
      color: '#4b5563',
      dynamicFontSize: { min: 6, max: 9, fit: 'vertical' },
      fontSize: 9,
      lineHeight: 1.25,
    }),
    rectangle('dividerLineLeft', { x: 93, y: 148 }, 27, 0.7, theme.secondary),
    rectangle('dividerDotLeft', { x: 132, y: 146.7 }, 2.5, 2.5, theme.primary, { radius: 1.25 }),
    rectangle('dividerLineMiddle', { x: 146, y: 148 }, 27, 0.7, theme.secondary),
    rectangle('dividerDotRight', { x: 185, y: 146.7 }, 2.5, 2.5, theme.primary, { radius: 1.25 }),
    rectangle('dividerLineRight', { x: 199, y: 148 }, 27, 0.7, theme.secondary),
    rectangle('infoBox', { x: 69, y: 155 }, 159, hasInstructor ? 32 : 23, theme.infoBackground, {
      borderColor: theme.infoBorder,
      borderWidth: 0.7,
      radius: 2,
    }),
    text('awardedLabel', { x: 77, y: 160 }, 45, 5, {
      content: data.labels.awarded,
      color: theme.primary,
      fontName: 'RobotoBold',
      fontSize: 7.5,
      readOnly: true,
    }),
    inputText('awardedDate', { x: 125, y: 160 }, 92, 5, {
      color: '#1f2937',
      dynamicFontSize: { min: 5.5, max: 8, fit: 'horizontal' },
      fontSize: 8,
    }),
    text('instructorLabel', { x: 77, y: 169 }, 45, 5, {
      content: hasInstructor ? data.labels.instructor : '',
      color: theme.primary,
      fontName: 'RobotoBold',
      fontSize: 7.5,
      readOnly: true,
    }),
    inputText('instructor', { x: 125, y: 169 }, 92, 5, {
      color: '#1f2937',
      dynamicFontSize: { min: 5.5, max: 8, fit: 'horizontal' },
      fontSize: 8,
    }),
    text('infoCertificateIdLabel', { x: 77, y: infoIdY }, 45, 5, {
      content: data.labels.certificateId,
      color: theme.primary,
      fontName: 'RobotoBold',
      fontSize: 7.5,
      readOnly: true,
    }),
    inputText('infoCertificateId', { x: 125, y: infoIdY }, 92, 5, {
      color: '#1f2937',
      dynamicFontSize: { min: 4.8, max: 8, fit: 'horizontal' },
      fontSize: 8,
    }),
    rectangle('footerLine', { x: 123, y: 192 }, 51, 0.5, theme.secondary),
    inputText('verificationNote', { x: 42, y: 196 }, 213, 6, {
      alignment: 'center',
      color: '#6b7280',
      dynamicFontSize: { min: 4.5, max: 6.5, fit: 'horizontal' },
      fontSize: 6.5,
    }),
  ];

  return {
    basePdf: {
      width: A4_LANDSCAPE.width,
      height: A4_LANDSCAPE.height,
      padding: [0, 0, 0, 0],
    },
    schemas: [schemas],
  };
};

const getPdfmePlugins = async (): Promise<Plugins> => {
  if (pdfmePlugins) return pdfmePlugins;

  const { image: imagePlugin, rectangle: rectanglePlugin, text: textPlugin } = await import('@pdfme/schemas');

  pdfmePlugins = {
    Image: imagePlugin,
    Rectangle: rectanglePlugin,
    Text: textPlugin,
  };

  return pdfmePlugins;
};

export const generateCertificatePdfBlob = async (data: CertificatePdfData): Promise<Blob> => {
  const [{ generate }, plugins, qrCode] = await Promise.all([
    import('@pdfme/generator'),
    getPdfmePlugins(),
    QRCode.toDataURL(data.verificationUrl, {
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
      margin: 2,
      type: 'image/png',
      width: 240,
    }),
  ]);

  const verificationHost = data.verificationUrl.replace('https://', '').replace('http://', '');
  const pdfBytes = await generate({
    inputs: [
      {
        awardedDate: data.awardedDate,
        certificateId: data.certificateId,
        certificationDescription: data.certificationDescription,
        certificationName: data.certificationName,
        certificationTypeLabel: data.certificationTypeLabel,
        infoCertificateId: data.certificateId,
        instructor: data.instructor ?? '',
        qrCode,
        verificationNote: `${data.labels.verificationNote}: ${verificationHost}`,
      },
    ],
    options: {
      creator: 'Ashyq Bilim',
      font: ROBOTO_FONT,
      producer: 'pdfme',
      title: data.certificationName,
    },
    plugins,
    template: buildTemplate(data),
  });

  return new Blob([pdfBytes], { type: 'application/pdf' });
};

export const downloadPdfBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
};

export const sanitizePdfFileName = (fileName: string) => fileName.replaceAll(/[^\dA-Za-z]/g, '_');
