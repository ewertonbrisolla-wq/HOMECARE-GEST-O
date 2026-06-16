/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { auth, db, signIn, logout, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc, serverTimestamp, collection, query, orderBy, where } from 'firebase/firestore';
import { ShiftForm } from './components/ShiftForm';
import { ShiftList } from './components/ShiftList';
import { RecentShiftsSummary } from './components/RecentShiftsSummary';
import { PatientManagement } from './components/PatientManagement';
import { Button } from './components/ui/button';
import { Toaster } from './components/ui/sonner';
import { ThemeProvider } from 'next-themes';
import { LogIn, LogOut, ClipboardList, LayoutDashboard, User as UserIcon, Loader2, MessageCircle, Settings as SettingsIcon, Image as ImageIcon, Type, Save, ShieldCheck, HelpCircle, Download } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from './components/ui/dialog';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { Settings, UserProfile, Shift } from './types';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card';
import { toast } from 'sonner';
import { maskPhone, compressImage } from './lib/utils';

const ADMIN_EMAIL = "ewerton.brisolla@gmail.com";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [settings, setSettings] = useState<Settings & { menuTitle1?: string; menuTitle2?: string }>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const isAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  useEffect(() => {
    // Dynamic PWA Manifest and Safari Icons
    const updatePwaMetadata = () => {
      try {
        const iconUrl = settings?.appIconUrl || settings?.logoUrl || "/favicon.svg";
        
        const getMimeType = (url: string) => {
          if (typeof url !== 'string') return 'image/png';
          if (url.startsWith('data:')) return url.split(';')[0].split(':')[1];
          if (url.endsWith('.svg')) return 'image/svg+xml';
          if (url.endsWith('.png')) return 'image/png';
          if (url.endsWith('.jpg') || url.endsWith('.jpeg')) return 'image/jpeg';
          return 'image/png';
        };

        // Update basic manifest
        const manifest = {
          name: "AUDIMED SAÚDE",
          short_name: "Audimed",
          id: "/",
          start_url: "/",
          scope: "/",
          display: "standalone",
          background_color: "#ffffff",
          theme_color: "#0f766e",
          orientation: "portrait",
          icons: [
            {
              src: iconUrl,
              sizes: "192x192",
              type: getMimeType(iconUrl),
              purpose: "any"
            },
            {
              src: iconUrl,
              sizes: "512x512",
              type: getMimeType(iconUrl),
              purpose: "any"
            },
            {
              src: iconUrl,
              sizes: "192x192",
              type: getMimeType(iconUrl),
              purpose: "maskable"
            }
          ]
        };
        
        const stringManifest = JSON.stringify(manifest);
        // Safer base64 encoding for potentially large/special character strings
        const manifestBase64 = btoa(encodeURIComponent(stringManifest).replace(/%([0-9A-F]{2})/g, (_, p1) => 
          String.fromCharCode(parseInt(p1, 16))
        ));
        const manifestURL = `data:application/json;base64,${manifestBase64}`;

        const manifestLink = document.getElementById('manifest-link') as HTMLLinkElement;
        
        // Remove any other manifests to ensure ours takes precedence
        const allManifests = document.querySelectorAll('link[rel="manifest"]');
        allManifests.forEach(m => {
          if (m !== manifestLink) m.remove();
        });

        if (manifestLink) {
          manifestLink.href = manifestURL;
        }

        // Update Apple Touch Icon
        let appleIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement;
        if (appleIcon) {
          appleIcon.href = iconUrl;
        }

        // Update shortcuts and favicons
        const iconLinks = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
        iconLinks.forEach(link => {
          (link as HTMLLinkElement).href = iconUrl;
        });
      } catch (e) {
        console.warn("Failed to update PWA metadata:", e);
      }
      
      return () => {};
    };
    
    if (settings) {
      const cleanup = updatePwaMetadata();
      return cleanup;
    }
  }, [settings?.appIconUrl, settings?.logoUrl]);

  useEffect(() => {
    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then((registration) => {
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed') {
                  if (navigator.serviceWorker.controller) {
                    // New content is available; please refresh.
                    toast.info('Nova atualização disponível! Clique aqui para atualizar.', {
                      duration: Infinity,
                      action: {
                        label: 'Atualizar',
                        onClick: () => window.location.reload()
                      },
                    });
                  }
                }
              };
            }
          };
        }).catch(err => {
          console.log('SW registration failed: ', err);
        });
      });
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    let q;
    if (isAdmin) {
      q = query(collection(db, 'shifts'), orderBy('createdAt', 'desc'));
    } else {
      q = query(
        collection(db, 'shifts'), 
        where('createdBy', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Shift));
      // Deduplicate by ID to prevent React key errors
      const uniqueData = data.filter((shift, index, self) =>
        index === self.findIndex((s) => s.id === shift.id)
      );
      setShifts(uniqueData);
    }, (error) => {
      if (error.code !== 'permission-denied') {
        handleFirestoreError(error, OperationType.LIST, 'shifts');
      }
    });

    return () => unsubscribe();
  }, [user, isAdmin]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        try {
          // Check if profile exists
          const profileDoc = await getDoc(doc(db, 'users', user.uid));
          if (profileDoc.exists()) {
            setProfile(profileDoc.data() as UserProfile);
            setShowProfileForm(false);
          } else {
            // New user, show profile form if not admin
            if (user.email !== ADMIN_EMAIL) {
              setShowProfileForm(true);
            } else {
              // Auto-create admin profile
              const adminProfile: UserProfile = {
                uid: user.uid,
                email: user.email!,
                displayName: user.displayName || 'Admin',
                photoURL: user.photoURL || null,
                role: 'admin',
                createdAt: serverTimestamp()
              };
              await setDoc(doc(db, 'users', user.uid), adminProfile);
              setProfile(adminProfile);
            }
          }
        } catch (err: any) {
          console.error("Error reading profile:", err);
          if (err.code === 'resource-exhausted') {
            toast.error("O sistema atingiu o limite de consultas gratuitas. Tente novamente amanhã ou contate o suporte.");
          }
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleProfileSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const formData = new FormData(e.currentTarget);
    const techProfile: UserProfile = {
      uid: user.uid,
      email: user.email!,
      displayName: user.displayName || '',
      photoURL: user.photoURL || null,
      role: 'tech',
      techName: formData.get('techName') as string,
      techCoren: formData.get('techCoren') as string,
      techWhatsapp: formData.get('techWhatsapp') as string,
      createdAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, 'users', user.uid), techProfile);
      setProfile(techProfile);
      setShowProfileForm(false);
      toast.success('Perfil configurado com sucesso!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users/' + user.uid);
      toast.error('Erro ao salvar perfil.');
    }
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'system'), (doc) => {
      if (doc.exists()) {
        setSettings(doc.data() as any);
      }
    }, (error) => {
      // Only log if it's not a permission error during initial load
      if (error.code !== 'permission-denied') {
        console.error('Erro ao carregar configurações:', error);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    if (signingIn) return;
    setSigningIn(true);
    try {
      await signIn();
    } catch (error: any) {
      if (error.code !== 'auth/cancelled-popup-request') {
        console.error('Erro ao entrar:', error);
      }
    } finally {
      setSigningIn(false);
    }
  };

  const saveSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isAdmin) return;
    
    setSavingSettings(true);
    const formData = new FormData(e.currentTarget);
    const newSettings = {
      logoUrl: formData.get('logoUrl') as string,
      appIconUrl: formData.get('appIconUrl') as string,
      menuTitle1: formData.get('menuTitle1') as string,
      menuTitle2: formData.get('menuTitle2') as string,
    };

    try {
      await setDoc(doc(db, 'settings', 'system'), newSettings);
      toast.success('Configurações atualizadas!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/system');
      toast.error('Erro ao salvar configurações.');
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-primary font-medium">Carregando...</div>
      </div>
    );
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <div className="min-h-screen bg-background font-sans text-foreground">
        <Toaster position="top-right" />
      
      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b border-primary/10 bg-background/80 backdrop-blur-md no-print">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt="Logo" className="h-10 w-auto object-contain" referrerPolicy="no-referrer" />
            ) : (
              <div className="bg-primary p-2 rounded-lg">
                <ClipboardList className="h-6 w-6 text-primary-foreground" />
              </div>
            )}
            <h1 className="text-xl font-bold tracking-tight hidden sm:block text-primary">
              AUDIMED SAÚDE <span className="text-muted-foreground font-normal">HOMECARE - GESTÃO</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-sm font-medium">{user.displayName}</span>
                  <span className="text-xs text-muted-foreground">{user.email}</span>
                </div>
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || ''} className="h-8 w-8 rounded-full border border-primary/20" referrerPolicy="no-referrer" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserIcon className="h-4 w-4 text-primary" />
                  </div>
                )}
                {deferredPrompt && (
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={handleInstallClick} 
                    className="bg-primary text-primary-foreground hover:bg-primary/90 animate-pulse hidden sm:flex"
                  >
                    <Download className="h-4 w-4 mr-2" /> Instalar App
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground hover:text-primary hover:bg-primary/10">
                  <LogOut className="h-4 w-4 mr-2" /> Sair
                </Button>
              </div>
            ) : (
              <Button onClick={handleSignIn} disabled={signingIn} className="bg-primary hover:bg-primary/90">
                {signingIn ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogIn className="h-4 w-4 mr-2" />}
                Entrar com Google
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {!user ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto mt-20 text-center space-y-6"
          >
            <div className="bg-card p-8 rounded-2xl shadow-xl border border-primary/10">
              <div className="w-24 h-24 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-6 overflow-hidden">
                {settings.logoUrl ? (
                  <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" referrerPolicy="no-referrer" />
                ) : (
                  <LayoutDashboard className="h-10 w-10" />
                )}
              </div>
              <h2 className="text-2xl font-bold mb-2 text-primary uppercase">BEM VINDO</h2>
              <p className="text-muted-foreground mb-8">
                Faça o Login para iniciar os lançamento dos atendimentos do período
              </p>
              <div className="space-y-4">
                <Button size="lg" className="w-full bg-primary hover:bg-primary/90" onClick={handleSignIn} disabled={signingIn}>
                  {signingIn ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <LogIn className="h-5 w-5 mr-2" />}
                  Entrar com Google
                </Button>
                
                <Dialog>
                  <DialogTrigger render={
                    <Button variant="outline" size="lg" className="w-full border-primary text-primary hover:bg-primary/5">
                      <HelpCircle className="h-5 w-5 mr-2" />
                      DÚVIDAS?
                    </Button>
                  } />
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <HelpCircle className="h-5 w-5 text-primary" />
                        Manual de Utilização
                      </DialogTitle>
                      <DialogDescription>
                        Siga o passo a passo abaixo para realizar seus lançamentos corretamente.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="markdown-body mt-4 prose prose-sm max-w-none">
                      <Markdown>
                        {settings.helpText || `### Como realizar um lançamento:
1. **Selecione o Paciente**: Escolha um paciente da lista cadastrada.
2. **Dados do Técnico(a)**: Verifique se seu nome, COREN e WhatsApp estão corretos.
3. **Serviço**: Informe o mês de competência, a quantidade de plantões de 12h realizados e o valor unitário acordado.
4. **Dados Bancários**: Informe seu banco e sua chave PIX para recebimento.
5. **Salvar**: Clique em "Salvar Lançamento" para registrar.

*Dica: Você pode editar lançamentos recentes clicando neles na lista abaixo, desde que ainda não tenham sido confirmados pela gestão.*`}
                      </Markdown>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </motion.div>
        ) : showProfileForm ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-xl mx-auto mt-10"
          >
            <Card className="border-primary/20 shadow-xl">
              <CardHeader className="bg-primary/5">
                <CardTitle className="text-primary flex items-center gap-2">
                  <ShieldCheck className="h-6 w-6" /> Complete seu Perfil
                </CardTitle>
                <CardDescription>
                  Para começar a lançar seus plantões, precisamos de alguns dados profissionais básicos que serão usados para preencher seus formulários automaticamente.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="techName">Nome Completo (para relatórios)</Label>
                    <Input id="techName" name="techName" required placeholder="Seu nome completo" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="techCoren">Número do COREN</Label>
                      <Input id="techCoren" name="techCoren" required placeholder="000.000" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="techWhatsapp">WhatsApp para Contato</Label>
                      <Input 
                        id="techWhatsapp" 
                        name="techWhatsapp" 
                        required 
                        placeholder="(00)00000-0000" 
                        onChange={(e) => {
                          e.target.value = maskPhone(e.target.value);
                        }}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full bg-primary hover:bg-primary/90 mt-4">
                    Concluir e Começar
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        ) : !isAdmin ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full space-y-8"
          >
            {deferredPrompt && (
              <Card className="border-primary bg-primary/5 shadow-md">
                <CardContent className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="bg-primary p-3 rounded-full text-primary-foreground">
                      <Download className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-primary">Instale o Aplicativo</h3>
                      <p className="text-sm text-muted-foreground">Tenha acesso rápido e fácil aos seus lançamentos direto da tela do seu celular.</p>
                    </div>
                  </div>
                  <Button onClick={handleInstallClick} className="w-full sm:w-auto bg-primary hover:bg-primary/90 font-bold whitespace-nowrap">
                    <Download className="h-4 w-4 mr-2" /> INSTALAR AGORA
                  </Button>
                </CardContent>
              </Card>
            )}
            <ShiftForm 
              key={`tech-form-${formKey}`}
              userProfile={profile} 
              allShifts={shifts} 
              isAdmin={isAdmin}
              onSuccess={() => setFormKey(prev => prev + 1)}
            />
            <RecentShiftsSummary 
              shifts={shifts} 
              isAdmin={isAdmin}
              onEdit={(s) => setEditingShift(s)}
            />

            <Dialog open={!!editingShift} onOpenChange={(open) => !open && setEditingShift(null)}>
              <DialogContent className="sm:max-w-[95vw] lg:max-w-6xl xl:max-w-[1200px] max-h-[95vh] overflow-y-auto block p-6">
                <DialogHeader className="border-b border-primary/10 pb-4 mb-4">
                  <DialogTitle className="text-xl font-bold text-primary">Editar Lançamento</DialogTitle>
                  <DialogDescription className="text-sm">
                    Corrija as informações do seu lançamento abaixo.
                  </DialogDescription>
                </DialogHeader>
                <ShiftForm 
                  userProfile={profile} 
                  allShifts={shifts} 
                  editShift={editingShift}
                  onSuccess={() => setEditingShift(null)}
                  onCancel={() => setEditingShift(null)}
                />
              </DialogContent>
            </Dialog>
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Tabs defaultValue="form" className="w-full">
                <div className="flex justify-center mb-8 no-print">
                  <TabsList className="grid w-full max-w-2xl grid-cols-3 bg-primary/5 p-1 border border-primary/10">
                    <TabsTrigger value="form" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      {settings.menuTitle1 || "Lançar Plantão"}
                    </TabsTrigger>
                    <TabsTrigger value="list" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      {settings.menuTitle2 || "Organização / Relatórios"}
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      Configurações
                    </TabsTrigger>
                  </TabsList>
                </div>
                
                <TabsContent value="form" className="space-y-8">
                  <ShiftForm 
                    key={`admin-form-${formKey}`}
                    userProfile={profile} 
                    allShifts={shifts} 
                    isAdmin={isAdmin}
                    onSuccess={() => setFormKey(prev => prev + 1)}
                  />
                  <RecentShiftsSummary 
                    shifts={shifts} 
                    isAdmin={isAdmin}
                    title="Últimos Lançamentos do Sistema" 
                    onEdit={(s) => setEditingShift(s)}
                  />

                  <Dialog open={!!editingShift} onOpenChange={(open) => !open && setEditingShift(null)}>
                    <DialogContent className="sm:max-w-[95vw] lg:max-w-6xl xl:max-w-[1200px] max-h-[95vh] overflow-y-auto block p-6">
                      <DialogHeader className="border-b border-primary/10 pb-4 mb-4">
                        <DialogTitle className="text-xl font-bold text-primary">Editar Lançamento</DialogTitle>
                        <DialogDescription className="text-sm">
                          Corrija as informações do lançamento selecionado.
                        </DialogDescription>
                      </DialogHeader>
                      <ShiftForm 
                        userProfile={profile} 
                        allShifts={shifts} 
                        editShift={editingShift}
                        isAdmin={isAdmin}
                        onSuccess={() => setEditingShift(null)}
                        onCancel={() => setEditingShift(null)}
                      />
                    </DialogContent>
                  </Dialog>
                </TabsContent>
                
                <TabsContent value="list">
                  <ShiftList shifts={shifts} isAdmin={isAdmin} />
                </TabsContent>

                <TabsContent value="settings" className="space-y-8">
                      <Card className="max-w-4xl mx-auto border-primary/20">
                        <CardHeader className="bg-primary/5">
                          <CardTitle className="text-xl font-bold text-primary flex items-center gap-2">
                            <SettingsIcon className="h-5 w-5" /> Configurações do Sistema
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                          <form onSubmit={saveSettings} className="space-y-6">
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label htmlFor="logoUrl" className="flex items-center gap-2">
                                  <ImageIcon className="h-4 w-4" /> Logo do Sistema (Upload ou URL)
                                </Label>
                                <div className="flex gap-2">
                                  <Input id="logoUrl" name="logoUrl" defaultValue={settings.logoUrl} placeholder="https://exemplo.com/logo.png" className="flex-1" />
                                  <div className="relative">
                                    <Button type="button" variant="outline" className="relative overflow-hidden">
                                      <ImageIcon className="h-4 w-4 mr-2" /> Upload
                                      <input 
                                        type="file" 
                                        accept="image/*" 
                                        className="absolute inset-0 opacity-0 cursor-pointer" 
                                        onChange={async (e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            try {
                                              const compressedBase64 = await compressImage(file);
                                              const input = document.getElementById('logoUrl') as HTMLInputElement;
                                              if (input) input.value = compressedBase64;
                                              toast.success('Imagem carregada e otimizada! Clique em Salvar para aplicar.');
                                            } catch (err) {
                                              toast.error('Erro ao processar imagem.');
                                            }
                                          }
                                        }}
                                      />
                                    </Button>
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground">Você pode colar um link direto ou fazer upload de uma imagem do seu computador.</p>
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="appIconUrl" className="flex items-center gap-2">
                                  <ImageIcon className="h-4 w-4" /> Ícone do Aplicativo (Instalação PWA)
                                </Label>
                                <div className="flex gap-2">
                                  <Input id="appIconUrl" name="appIconUrl" defaultValue={settings.appIconUrl} placeholder="Deixe em branco para usar a mesma logo do sistema" className="flex-1" />
                                  <div className="relative">
                                    <Button type="button" variant="outline" className="relative overflow-hidden">
                                      <ImageIcon className="h-4 w-4 mr-2" /> Upload
                                      <input 
                                        type="file" 
                                        accept="image/*" 
                                        className="absolute inset-0 opacity-0 cursor-pointer" 
                                        onChange={async (e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            try {
                                              const compressedBase64 = await compressImage(file);
                                              const input = document.getElementById('appIconUrl') as HTMLInputElement;
                                              if (input) input.value = compressedBase64;
                                              toast.success('Ícone carregado e otimizado! Clique em Salvar para aplicar.');
                                            } catch (err) {
                                              toast.error('Erro ao processar ícone.');
                                            }
                                          }
                                        }}
                                      />
                                    </Button>
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground">Esta imagem será usada quando os usuários instalarem o sistema como um aplicativo no celular ou computador. Formato quadrado recomendado (192x192 ou 512x512).</p>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor="menuTitle1" className="flex items-center gap-2">
                                    <Type className="h-4 w-4" /> Título Menu 1
                                  </Label>
                                  <Input id="menuTitle1" name="menuTitle1" defaultValue={settings.menuTitle1 || "Lançar Plantão"} />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="menuTitle2" className="flex items-center gap-2">
                                    <Type className="h-4 w-4" /> Título Menu 2
                                  </Label>
                                  <Input id="menuTitle2" name="menuTitle2" defaultValue={settings.menuTitle2 || "Organização / Relatórios"} />
                                </div>
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="helpText" className="flex items-center gap-2">
                                  <HelpCircle className="h-4 w-4" /> Texto do Manual (Markdown)
                                </Label>
                                <textarea 
                                  id="helpText" 
                                  name="helpText" 
                                  defaultValue={settings.helpText} 
                                  rows={8}
                                  className="w-full p-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                  placeholder="Digite o passo a passo em formato Markdown..."
                                />
                                <p className="text-[10px] text-muted-foreground">Suporta formatação Markdown (### Títulos, * Itens, **Negrito**).</p>
                              </div>
                            </div>
                            
                            <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={savingSettings}>
                              {savingSettings ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                              Salvar Configurações
                            </Button>
                          </form>
                        </CardContent>
                      </Card>

                      <Card className="max-w-4xl mx-auto border-primary/20">
                        <CardContent className="pt-6">
                          <PatientManagement isAdmin={isAdmin} />
                        </CardContent>
                      </Card>
                    </TabsContent>
                </Tabs>
              </motion.div>
            </AnimatePresence>
          )}
      </main>

      {/* WhatsApp Help Button */}
      <a 
        href={`https://wa.me/5592991208967?text=${encodeURIComponent("TENHO UMA DÚVIDA NO SISTEMA GESTÃO AUDIMED, PODE ME AJUDAR?")}`} 
        target="_blank" 
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 bg-[#25D366] text-white p-4 rounded-full shadow-lg hover:scale-110 transition-transform flex items-center justify-center no-print"
        title="Dúvidas? Fale com o desenvolvedor"
      >
        <MessageCircle className="h-6 w-6 fill-current" />
      </a>

      {/* Footer */}
      <footer className="py-8 border-t border-primary/10 bg-background mt-12 no-print">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          &copy; {new Date().getFullYear()} AUDIMED SAÚDE HOMECARE - GESTÃO. Todos os direitos reservados.
        </div>
      </footer>
      </div>
    </ThemeProvider>
  );
}
