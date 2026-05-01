'use client';

import { Award, Building, Calendar, CheckCircle, Hash, QrCode, User } from 'lucide-react';
import { usePlatform } from '@/components/Contexts/PlatformContext';
import { getLogoMediaDirectory } from '@services/media/media';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import type React from 'react';
import QRCode from 'qrcode';

interface CertificatePreviewProps {
  certificationName: string;
  certificationDescription: string;
  certificationType: string;
  certificatePattern: string;
  certificateInstructor?: string;
  certificateId?: string;
  awardedDate?: string;
  qrCodeLink?: string;
}

type CertificateLayout = 'classic' | 'double' | 'minimal' | 'split';

function getCertificateLayout(pattern: string): CertificateLayout {
  switch (pattern) {
    case 'royal':
    case 'academic': {
      return 'double';
    }
    case 'tech':
    case 'modern': {
      return 'split';
    }
    case 'minimal':
    case 'professional': {
      return 'minimal';
    }
    default: {
      return 'classic';
    }
  }
}

function getCertificateShellClass(layout: CertificateLayout) {
  switch (layout) {
    case 'double': {
      return 'border-2 border-border p-5 shadow-sm';
    }
    case 'minimal': {
      return 'border border-border p-6';
    }
    case 'split': {
      return 'overflow-hidden border border-border p-0';
    }
    default: {
      return 'border border-border p-5 shadow-sm';
    }
  }
}

function getCertificateBodyClass(layout: CertificateLayout) {
  switch (layout) {
    case 'split': {
      return 'grid gap-0 md:grid-cols-[1fr_14rem]';
    }
    default: {
      return 'flex h-full flex-col';
    }
  }
}

const CertificatePreview: React.FC<CertificatePreviewProps> = ({
  certificationName,
  certificationDescription,
  certificationType,
  certificatePattern,
  certificateInstructor,
  certificateId,
  awardedDate,
  qrCodeLink,
}) => {
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const platform = usePlatform();
  const tTypes = useTranslations('Certificates.EditCourseCertification.certificationTypes');
  const t = useTranslations('Certificates.CertificatePreview');
  const layout = getCertificateLayout(certificatePattern);

  useEffect(() => {
    const generateQRCode = async () => {
      try {
        const certificateData = qrCodeLink || `${certificateId}`;
        const qrUrl = await QRCode.toDataURL(certificateData, {
          width: 185,
          margin: 1,
          errorCorrectionLevel: 'M',
          type: 'image/png',
        });
        setQrCodeUrl(qrUrl);
      } catch (error) {
        console.error('Error generating QR code:', error);
      }
    };

    generateQRCode();
  }, [certificateId, qrCodeLink]);

  return (
    <div className="bg-card rounded-xl border p-4">
      <div
        className={cn(
          'relative min-h-[32rem] rounded-lg bg-background text-foreground',
          getCertificateShellClass(layout),
        )}
      >
        {layout === 'double' ? (
          <div className="border-border pointer-events-none absolute inset-3 rounded-md border" />
        ) : null}
        {layout === 'classic' ? <div className="bg-border pointer-events-none absolute inset-x-10 top-6 h-px" /> : null}

        <div className={getCertificateBodyClass(layout)}>
          <div className={cn('relative flex flex-col', layout === 'split' ? 'p-6 md:p-8' : 'h-full')}>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-muted-foreground flex items-center gap-1 text-xs font-medium tracking-[0.18em] uppercase">
                  <Hash className="size-3.5" />
                  <span>{t('certificateIdInline', { id: certificateId || 'OU-2025-001' })}</span>
                </div>
                <div className="text-muted-foreground text-xs tracking-[0.18em] uppercase">{t('certificate')}</div>
              </div>

              {layout !== 'split' ? (
                <div className="bg-card flex h-16 w-16 items-center justify-center rounded-md border p-1 sm:h-24 sm:w-24">
                  {qrCodeUrl ? (
                    <Image
                      src={qrCodeUrl}
                      alt={t('certificateQRAlt')}
                      className="h-full w-full object-contain"
                      width={96}
                      height={96}
                      unoptimized
                    />
                  ) : (
                    <QrCode className="text-muted-foreground h-10 w-10" />
                  )}
                </div>
              ) : null}
            </div>

            <div className="flex flex-1 flex-col items-center justify-center px-2 py-10 text-center">
              <div className="text-muted-foreground mb-4 flex items-center gap-2">
                <div className="bg-border h-px w-8" />
                <Award className="size-5" />
                <div className="bg-border h-px w-8" />
              </div>

              <h4 className="max-w-xl text-lg font-semibold tracking-tight sm:text-2xl">
                {certificationName || t('certificationName')}
              </h4>
              <p className="text-muted-foreground mt-4 max-w-2xl text-sm leading-7 sm:text-base">
                {certificationDescription || t('certificationDescriptionPlaceholder')}
              </p>

              <div className="bg-muted mt-6 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium">
                <CheckCircle className="size-4" />
                <span>{tTypes(certificationType, { defaultValue: tTypes('completion') })}</span>
              </div>
            </div>

            <div className="grid gap-4 border-t pt-6 sm:grid-cols-3">
              <div className="space-y-1 text-left">
                <div className="text-muted-foreground flex items-center gap-2 text-xs tracking-[0.18em] uppercase">
                  <User className="size-3.5" />
                  <span>{t('instructor')}</span>
                </div>
                <div className="text-foreground text-sm font-medium">
                  {certificateInstructor || t('instructorName')}
                </div>
              </div>

              <div className="space-y-2 text-center">
                <div className="flex items-center justify-center">
                  {platform?.logo_image ? (
                    <Image
                      src={getLogoMediaDirectory(platform.logo_image)}
                      alt={t('organizationLogoAlt')}
                      className="h-10 w-10 object-contain"
                      width={40}
                      height={40}
                      unoptimized
                    />
                  ) : (
                    <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full border">
                      <Building className="text-muted-foreground h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="text-foreground text-sm font-medium">{platform?.name || ''}</div>
              </div>

              <div className="space-y-1 text-right">
                <div className="text-muted-foreground flex items-center justify-end gap-2 text-xs tracking-[0.18em] uppercase">
                  <Calendar className="size-3.5" />
                  <span>{t('awardedLabel')}</span>
                </div>
                <div className="text-foreground text-sm font-medium">{awardedDate || t('completedOn')}</div>
              </div>
            </div>
          </div>

          {layout === 'split' ? (
            <aside className="bg-muted/50 border-t p-6 md:border-t-0 md:border-l">
              <div className="space-y-4">
                <div>
                  <div className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
                    {t('template')}
                  </div>
                  <div className="text-foreground mt-2 text-sm font-medium">
                    {t(`certificatePatterns.${certificatePattern}`, {
                      defaultValue: t('certificate'),
                    })}
                  </div>
                </div>

                <div className="bg-background rounded-lg border p-3">
                  <div className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
                    {t('qrLabel')}
                  </div>
                  <div className="mt-3 flex items-center justify-center">
                    {qrCodeUrl ? (
                      <Image
                        src={qrCodeUrl}
                        alt={t('certificateQRAlt')}
                        className="h-28 w-28 object-contain"
                        width={112}
                        height={112}
                        unoptimized
                      />
                    ) : (
                      <QrCode className="text-muted-foreground h-14 w-14" />
                    )}
                  </div>
                </div>

                <div className="bg-background text-muted-foreground rounded-lg border p-3 text-sm">
                  {t('previewNote')}
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default CertificatePreview;
