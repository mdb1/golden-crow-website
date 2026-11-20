type BrandedEmailLayout = {
  brandName: string;
  title: string;
  preheader: string;
  bodyHtml: string;
};

export function escapeEmailHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderBrandedEmailButton(href: string, label: string) {
  return `<a href="${escapeEmailHtml(href)}" style="display:inline-block;background:#6f3cc3;color:#ffffff;text-decoration:none;border-radius:12px;padding:16px 24px;font-size:15px;line-height:20px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">${escapeEmailHtml(label)}</a>`;
}

export function renderBrandedEmail({ brandName, title, preheader, bodyHtml }: BrandedEmailLayout) {
  return `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeEmailHtml(preheader)}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0;padding:0;background:#f8f7ff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e7e5ff;border-radius:18px;overflow:hidden;box-shadow:0 18px 48px rgba(86,50,164,0.14);">
            <tr>
              <td style="background:#2d1b69;padding:36px 40px;">
                <div style="font-size:13px;line-height:18px;letter-spacing:0.26em;text-transform:uppercase;font-weight:800;color:#d8c9ff;">
                  ${escapeEmailHtml(brandName)}
                </div>
                <div style="margin-top:16px;font-size:36px;line-height:42px;font-weight:800;color:#ffffff;">
                  ${escapeEmailHtml(title)}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:40px;background:#ffffff;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}
