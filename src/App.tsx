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
import { LogIn, LogOut, ClipboardList, LayoutDashboard, User as UserIcon, Loader2, MessageCircle, Settings as SettingsIcon, Image as ImageIcon, Type, Save, ShieldCheck, HelpCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from './components/ui/dialog';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { Settings, UserProfile, Shift } from './types';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card';
import { toast } from 'sonner';
import { maskPhone } from './lib/utils';

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

  const isAdmin = user?.email === ADMIN_EMAIL;

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
    <div className="min-h-screen bg-background font-sans text-foreground">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b border-primary/10 bg-white/80 backdrop-blur-md no-print">
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
              <h2 className="text-2xl font-bold mb-2 text-primary">Bem-vindo</h2>
              <p className="text-muted-foreground mb-8">
                Faça login para gerenciar os plantões de enfermagem da AUDIMED SAÚDE.
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
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Editar Lançamento</DialogTitle>
                  <DialogDescription>
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
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Editar Lançamento</DialogTitle>
                        <DialogDescription>
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
                                            const reader = new FileReader();
                                            reader.onloadend = () => {
                                              const base64String = reader.result as string;
                                              const input = document.getElementById('logoUrl') as HTMLInputElement;
                                              if (input) input.value = base64String;
                                              toast.info('Imagem carregada localmente. Clique em Salvar para aplicar.');
                                            };
                                            reader.readAsDataURL(file);
                                          }
                                        }}
                                      />
                                    </Button>
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground">Você pode colar um link direto ou fazer upload de uma imagem do seu computador.</p>
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
      <footer className="py-8 border-t border-primary/10 bg-white mt-12 no-print">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          &copy; {new Date().getFullYear()} AUDIMED SAÚDE HOMECARE - GESTÃO. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}
