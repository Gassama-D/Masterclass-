"""Tests de bout en bout dans un vrai navigateur (Playwright).
Usage : python3 test/e2e.py http://localhost:3101/
Le serveur doit tourner avec une base VIDE et un WHATSAPP_GROUP_INVITE_URL de test.
"""
import sys
from playwright.sync_api import sync_playwright

B = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3101/'
WA = 'https://chat.whatsapp.com/TESTLINKABCDEFGHIJKL'
res = []


def ok(name, cond, extra=''):
    res.append((name, bool(cond)))
    print(('PASS' if cond else 'FAIL'), name, extra)


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    pg = ctx.new_page()
    reqs = []
    pg.on('request', lambda r: reqs.append(r.url) if '/api/register' in r.url else None)
    pg.goto(B)
    pg.wait_for_timeout(1200)

    s1 = pg.inner_text('#cd-s')
    pg.wait_for_timeout(2100)
    s2 = pg.inner_text('#cd-s')
    ok('compte à rebours qui avance', s1 != s2, f'{s1}->{s2}')
    ok('jours restants > 0', int(pg.inner_text('#cd-d')) > 0, pg.inner_text('#cd-d'))

    pg.click('#hero-cta')
    pg.wait_for_timeout(600)
    pg.click('#submit')
    pg.wait_for_timeout(300)
    ok('erreurs affichées sur champs vides', all(pg.inner_text(f'#err-{k}') for k in ['fullName', 'email', 'phone', 'consent']))
    ok('aucune requête serveur si formulaire invalide', len(reqs) == 0)
    pg.screenshot(path='/tmp/m_errors.png')

    pg.fill('#fullName', 'Mamadou Barry')
    pg.fill('#email', 'mamadou.barry@example.com')
    pg.fill('#phone', '622 11 22 33')
    pg.check('#consent')
    pg.dblclick('#submit')
    pg.wait_for_selector('#done:not([hidden])', timeout=8000)
    ok('double clic = une seule requête', len(reqs) == 1, str(len(reqs)))
    ok('titre de confirmation', pg.inner_text('#done-title') == 'Ton inscription est enregistrée.')
    ok('bouton « REJOINDRE LE GROUPE WHATSAPP »', pg.inner_text('#wa-btn') == 'REJOINDRE LE GROUPE WHATSAPP')
    ok('lien WhatsApp réel + nouvel onglet', pg.get_attribute('#wa-btn', 'href') == WA and pg.get_attribute('#wa-btn', 'target') == '_blank')
    ok('aucune mention d’e-mail sans SMTP', not pg.is_visible('#done-mail'))
    pg.screenshot(path='/tmp/m_done.png')

    with pg.expect_download() as d:
        pg.click('#ics-btn')
    ok('fichier agenda .ics correct', 'DTSTART:20261205T203000Z' in open(d.value.path()).read())

    pg.goto(B)
    pg.wait_for_timeout(500)
    pg.fill('#fullName', 'Mamadou Barry')
    pg.fill('#email', 'MAMADOU.BARRY@example.com')
    pg.fill('#phone', '655 00 11 22')
    pg.check('#consent')
    pg.click('#submit')
    pg.wait_for_selector('#done:not([hidden])', timeout=8000)
    ok('doublon e-mail détecté et expliqué', pg.inner_text('#done-title') == 'Tu es déjà inscrit(e).' and 'e-mail est déjà associée' in pg.inner_text('#done-msg'), pg.inner_text('#done-msg'))
    ok('bouton WhatsApp aussi pour un inscrit qui revient', pg.get_attribute('#wa-btn', 'href') == WA)
    pg.screenshot(path='/tmp/m_dup.png')

    pg.goto(B)
    pg.wait_for_timeout(400)
    pg.fill('#fullName', 'Awa Sylla')
    pg.fill('#email', 'awa@example.com')
    pg.fill('#phone', '622 99 88 77')
    pg.check('#consent')
    ctx.set_offline(True)
    pg.click('#submit')
    pg.wait_for_timeout(1500)
    ok('erreur claire si connexion coupée', pg.is_visible('#status') and 'n’a pas été enregistrée' in pg.inner_text('#status'))
    ok('aucun faux succès hors ligne', not pg.is_visible('#done'))
    ok('bouton réutilisable après l’erreur', pg.is_enabled('#submit'))
    pg.screenshot(path='/tmp/m_offline.png')
    ctx.set_offline(False)
    pg.click('#submit')
    pg.wait_for_selector('#done:not([hidden])', timeout=8000)
    ok('réessai réussi après retour du réseau', pg.inner_text('#done-title') == 'Ton inscription est enregistrée.')

    for w in (360, 390, 768, 1024, 1440):
        pg2 = b.new_page(viewport={'width': w, 'height': 900})
        pg2.goto(B)
        pg2.wait_for_timeout(400)
        ok(f'pas de défilement horizontal à {w}px', pg2.evaluate('document.documentElement.scrollWidth<=window.innerWidth'))
        pg2.close()
    b.close()

print('RESULTAT', sum(1 for _, c in res if c), '/', len(res))
sys.exit(0 if all(c for _, c in res) else 1)
