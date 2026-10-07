import { supabase } from "../shared/js/supabase.js";
import { initLayout } from "../shared/js/layout.js";
import { COMPRAS_MENU } from "./compras-menu.js";
await initLayout({supabase,brand:{nome:"Compras Públicas",subtitulo:"Intranet Municipal",icone:"fa-cart-shopping"},iconeTitulo:"fa-circle-question",titulo:"Ajuda do módulo",subtitulo:"Orientações operacionais e segurança",moduloAtivo:"compras-ajuda",rotaVoltar:"./index.html",textoVoltar:"Voltar ao painel",menuUsuario:{rotaPerfil:"../perfil.html",rotaAjuda:"ajuda.html"},menu:COMPRAS_MENU});
