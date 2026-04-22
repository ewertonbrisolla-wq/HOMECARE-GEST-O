import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { Patient } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { toast } from 'sonner';
import { Loader2, Plus, Edit2, Trash2, UserPlus, X, Save } from 'lucide-react';
import { getShiftLimit, formatCurrency } from '../lib/shift-logic';
import { maskPhone } from '../lib/utils';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';

interface PatientManagementProps {
  isAdmin?: boolean;
}

export function PatientManagement({ isAdmin: propIsAdmin }: PatientManagementProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [showForm, setShowForm] = useState(false);

  const isAdmin = propIsAdmin ?? (auth.currentUser?.email === "ewerton.brisolla@gmail.com");

  useEffect(() => {
    const q = query(collection(db, 'patients'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Patient));
      // Deduplicate by ID to prevent React key errors
      const uniqueData = data.filter((p, index, self) =>
        index === self.findIndex((s) => s.id === p.id)
      );
      setPatients(uniqueData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'patients');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const formData = new FormData(e.currentTarget);
    
    const patientData = {
      name: formData.get('name') as string,
      healthInsurance: formData.get('healthInsurance') as string,
      dob: formData.get('dob') as string,
      gender: formData.get('gender') as any,
      responsibleName: formData.get('responsibleName') as string,
      responsiblePhone: formData.get('responsiblePhone') as string,
      hasMealAllowance: formData.get('hasMealAllowance') === 'true',
      mealAllowanceValue: Number(formData.get('mealAllowanceValue') || 0),
    };

    try {
      if (editingPatient?.id) {
        await updateDoc(doc(db, 'patients', editingPatient.id), patientData);
        toast.success('Paciente atualizado com sucesso!');
      } else {
        await addDoc(collection(db, 'patients'), {
          ...patientData,
          createdAt: serverTimestamp()
        });
        toast.success('Paciente cadastrado com sucesso!');
      }
      setShowForm(false);
      setEditingPatient(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'patients');
      toast.error('Erro ao salvar paciente.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este paciente?')) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'patients', id));
      toast.success('Paciente excluído.');
      setEditingPatient(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'patients/' + id);
      toast.error('Erro ao excluir paciente.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-primary flex items-center gap-2">
          <UserPlus className="h-5 w-5" /> Cadastro de Pacientes
        </h3>
        {!showForm && (
          <Button onClick={() => setShowForm(true)} className="bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" /> Novo Paciente
          </Button>
        )}
      </div>

      {showForm && !editingPatient && (
        <Card className="border-primary/20 shadow-lg">
          <CardHeader className="bg-primary/5">
            <CardTitle className="text-base flex justify-between items-center">
              Novo Cadastro
              <Button variant="ghost" size="icon" onClick={() => { setShowForm(false); }}>
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Paciente</Label>
                  <Input id="name" name="name" required placeholder="Nome completo" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="healthInsurance">Convênio</Label>
                  <Input id="healthInsurance" name="healthInsurance" required placeholder="Ex: Unimed, Bradesco" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dob">Data de Nascimento</Label>
                  <Input id="dob" name="dob" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gender">Sexo</Label>
                  <Select name="gender" defaultValue="M">
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">Masculino</SelectItem>
                      <SelectItem value="F">Feminino</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="responsibleName">Responsável</Label>
                  <Input id="responsibleName" name="responsibleName" required placeholder="Nome do responsável" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="responsiblePhone">Contato do Responsável</Label>
                  <Input 
                    id="responsiblePhone" 
                    name="responsiblePhone" 
                    required 
                    placeholder="(00)00000-0000" 
                    onChange={(e) => {
                      e.target.value = maskPhone(e.target.value);
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="hasMealAllowance">R$ de Alimentação?</Label>
                  <Select name="hasMealAllowance" defaultValue="false">
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Sim</SelectItem>
                      <SelectItem value="false">Não</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mealAllowanceValue">Valor da Alimentação (por plantão)</Label>
                  <Input 
                    id="mealAllowanceValue" 
                    name="mealAllowanceValue" 
                    type="number" 
                    step="0.01" 
                    defaultValue={0} 
                    placeholder="0,00" 
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Salvar Paciente
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => { setShowForm(false); }}
                  disabled={saving}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!editingPatient} onOpenChange={(open) => !open && setEditingPatient(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Paciente</DialogTitle>
            <DialogDescription>
              Altere os dados do paciente ou exclua o cadastro.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome do Paciente</Label>
                <Input id="edit-name" name="name" defaultValue={editingPatient?.name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-healthInsurance">Convênio</Label>
                <Input id="edit-healthInsurance" name="healthInsurance" defaultValue={editingPatient?.healthInsurance} required />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-dob">Data de Nascimento</Label>
                <Input id="edit-dob" name="dob" type="date" defaultValue={editingPatient?.dob} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-gender">Sexo</Label>
                <Select name="gender" defaultValue={editingPatient?.gender || 'M'}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Masculino</SelectItem>
                    <SelectItem value="F">Feminino</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-responsibleName">Responsável</Label>
                <Input id="edit-responsibleName" name="responsibleName" defaultValue={editingPatient?.responsibleName} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-responsiblePhone">Contato do Responsável</Label>
                <Input 
                  id="edit-responsiblePhone" 
                  name="responsiblePhone" 
                  defaultValue={editingPatient?.responsiblePhone} 
                  required 
                  onChange={(e) => {
                    e.target.value = maskPhone(e.target.value);
                  }}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-hasMealAllowance">R$ de Alimentação?</Label>
                <Select name="hasMealAllowance" defaultValue={editingPatient?.hasMealAllowance ? 'true' : 'false'}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Sim</SelectItem>
                    <SelectItem value="false">Não</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-mealAllowanceValue">Valor da Alimentação</Label>
                <Input 
                  id="edit-mealAllowanceValue" 
                  name="mealAllowanceValue" 
                  type="number" 
                  step="0.01" 
                  defaultValue={editingPatient?.mealAllowanceValue || 0} 
                />
              </div>
            </div>
            <div className="flex flex-col gap-3 pt-4">
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={saving || deleting}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar Alterações
              </Button>
              <Button 
                type="button" 
                variant="destructive" 
                className="w-full" 
                onClick={() => editingPatient?.id && handleDelete(editingPatient.id)}
                disabled={saving || deleting}
              >
                {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Excluir Cadastro do Paciente
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                className="w-full" 
                onClick={() => setEditingPatient(null)}
                disabled={saving || deleting}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="border border-primary/10 rounded-xl overflow-hidden shadow-sm bg-white">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="font-bold">Paciente</TableHead>
              <TableHead className="font-bold">Convênio</TableHead>
              <TableHead className="font-bold">Alimentação</TableHead>
              <TableHead className="font-bold">Responsável</TableHead>
              <TableHead className="text-right font-bold">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Nenhum paciente cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              patients.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.healthInsurance}</TableCell>
                  <TableCell>
                    {p.hasMealAllowance ? (
                      <span className="text-green-600 font-bold">Sim ({formatCurrency(p.mealAllowanceValue || 0)})</span>
                    ) : (
                      <span className="text-muted-foreground">Não</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs">
                      <p className="font-bold">{p.responsibleName}</p>
                      <p className="text-muted-foreground">{maskPhone(p.responsiblePhone)}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-primary hover:bg-primary/10"
                        onClick={() => { setEditingPatient(p); setShowForm(true); }}
                        title="Editar Paciente"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        onClick={() => p.id && handleDelete(p.id)}
                        title="Excluir Paciente"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
