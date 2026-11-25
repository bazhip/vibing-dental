// Unsubscribe landing page for product-update emails. Opening the link does
// nothing by itself; the button POSTs the signed token to the unsubscribe
// function, so mail scanners that pre-fetch links can't unsubscribe anyone.
(function () {
  var ENDPOINT = 'https://ocjnngfzwyajhgqzicsf.supabase.co/functions/v1/unsubscribe';
  var T = {
    en: ['Unsubscribe from product updates', 'You’ll stop receiving ToothOps product-update emails. Account and security emails are not affected.', 'Unsubscribe', 'You’re unsubscribed.', 'This link is invalid or expired.', 'Something went wrong. Please try again.'],
    fr: ['Se désabonner des actualités produit', 'Vous ne recevrez plus les e-mails d’actualités produit de ToothOps. Les e-mails de compte et de sécurité ne sont pas concernés.', 'Se désabonner', 'Vous êtes désabonné.', 'Ce lien n’est pas valide ou a expiré.', 'Une erreur s’est produite. Veuillez réessayer.'],
    de: ['Produkt-Updates abbestellen', 'Sie erhalten keine Produkt-Update-E-Mails von ToothOps mehr. Konto- und Sicherheits-E-Mails sind nicht betroffen.', 'Abbestellen', 'Sie wurden abgemeldet.', 'Dieser Link ist ungültig oder abgelaufen.', 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.'],
    it: ['Annulla l’iscrizione agli aggiornamenti di prodotto', 'Non riceverà più le e-mail di aggiornamento di prodotto di ToothOps. Le e-mail di account e di sicurezza non sono interessate.', 'Annulla iscrizione', 'Iscrizione annullata.', 'Questo link non è valido o è scaduto.', 'Qualcosa è andato storto. Riprovi.'],
    es: ['Darse de baja de las novedades de producto', 'Dejará de recibir los correos de novedades de producto de ToothOps. Los correos de cuenta y de seguridad no se ven afectados.', 'Darse de baja', 'Se ha dado de baja.', 'Este enlace no es válido o ha caducado.', 'Algo salió mal. Inténtelo de nuevo.'],
    hu: ['Leiratkozás a termékhírekről', 'Nem kap több ToothOps termékhír-e-mailt. A fiók- és biztonsági e-maileket ez nem érinti.', 'Leiratkozás', 'Leiratkozott.', 'Ez a hivatkozás érvénytelen vagy lejárt.', 'Valami hiba történt. Kérjük, próbálja újra.'],
    ro: ['Dezabonare de la noutățile de produs', 'Nu veți mai primi e-mailurile cu noutăți de produs ToothOps. E-mailurile despre cont și securitate nu sunt afectate.', 'Dezabonare', 'V-ați dezabonat.', 'Acest link nu este valid sau a expirat.', 'A apărut o eroare. Încercați din nou.'],
    zh: ['退订产品更新', '您将不再收到 ToothOps 的产品更新邮件。账户和安全邮件不受影响。', '退订', '您已退订。', '此链接无效或已过期。', '出了点问题，请重试。'],
    ar: ['إلغاء الاشتراك في تحديثات المنتج', 'لن تصلك رسائل تحديثات منتج ToothOps بعد الآن. لا تتأثر رسائل الحساب والأمان.', 'إلغاء الاشتراك', 'تم إلغاء اشتراكك.', 'هذا الرابط غير صالح أو منتهي الصلاحية.', 'حدث خطأ ما. يُرجى المحاولة مرة أخرى.'],
    pl: ['Wypisz się z informacji o produkcie', 'Nie będziesz już otrzymywać e-maili z nowościami o produkcie ToothOps. Wiadomości dotyczące konta i bezpieczeństwa nie są objęte.', 'Wypisz mnie', 'Wypisano.', 'Ten link jest nieprawidłowy lub wygasł.', 'Coś poszło nie tak. Spróbuj ponownie.'],
  };
  var params = new URLSearchParams(location.search);
  var lang = (params.get('lang') || navigator.language || 'en').toLowerCase().split('-')[0];
  var s = T[lang] || T.en;
  var token = params.get('t') || '';
  var $ = function (id) { return document.getElementById(id); };
  document.documentElement.lang = T[lang] ? lang : 'en';
  if (lang === 'ar') document.documentElement.dir = 'rtl';
  document.title = s[0] + ' · ToothOps';
  $('title').textContent = s[0];
  $('body').textContent = s[1];
  $('go').textContent = s[2];
  if (!token) { $('go').hidden = true; $('msg').textContent = s[4]; return; }
  $('go').addEventListener('click', function () {
    var btn = $('go');
    btn.disabled = true;
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token }) })
      .then(function (r) {
        if (r.ok) { btn.hidden = true; $('body').hidden = true; $('msg').textContent = s[3]; return; }
        btn.disabled = false;
        $('msg').textContent = r.status === 400 ? s[4] : s[5];
      })
      .catch(function () { btn.disabled = false; $('msg').textContent = s[5]; });
  });
})();
