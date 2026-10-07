import type { ArvoreEquipes as Arvore, NoEquipe, NoParticipante, NoPlano } from "@planogestao/shared-types";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useSituacaoEquipe } from "../../hooks/useEquipes";
import styles from "../admin/Admin.module.css";
import { Badge } from "../ui/Badge";
import { Button, ButtonLink, classesDoBotao } from "../ui/Button";
import { DropdownItem, DropdownMenu } from "../ui/DropdownMenu";
import { Icon } from "../ui/Icon";
import estilos from "./ArvoreEquipes.module.css";
import { ModalAcoesParticipante, type ParticipanteNoPlano } from "./ModalAcoesParticipante";
import { ModalExcluirEquipe, type EquipeParaExcluir } from "./ModalExcluirEquipe";

const chavePlano = (p: NoPlano) => (p.plano ? `p${p.plano.id}` : "sem-plano");
const resumir = (texto: string | null, limite = 120) =>
  !texto ? null : texto.length > limite ? `${texto.slice(0, limite).trimEnd()}…` : texto;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Coordenador primeiro (em destaque), depois os demais por nome — todos no mesmo nível: não há chefia. */
const ordenar = (ps: NoParticipante[]) => [...ps.filter((p) => p.coordenador), ...ps.filter((p) => !p.coordenador)];

/** Seta direita/esquerda no botão de expandir: abre/fecha (além de Enter/Espaço, nativos do botão). */
const teclasExpandir = (aberto: boolean, alternar: () => void) => (e: KeyboardEvent<HTMLButtonElement>) => {
  if ((e.key === "ArrowRight" && !aberto) || (e.key === "ArrowLeft" && aberto)) {
    e.preventDefault();
    alternar();
  }
};

/**
 * Equipes › Árvore: plano de ação → equipes → composição. Só representa os vínculos reais (equipe_membros); não
 * cria hierarquia, não altera perfis, áreas ou responsáveis. A mesma pessoa pode aparecer em várias equipes (o
 * mesmo usuário); os totais contam pessoas distintas. Padrão "disclosure": cada nível tem um botão com
 * aria-expanded, e os links e menus ficam fora dele (clicar neles não expande nem abre outro registro).
 */
export function ArvoreEquipes({ dados, buscaParticipante }: { dados: Arvore; buscaParticipante: boolean }) {
  const navigate = useNavigate();
  const situacao = useSituacaoEquipe();
  const [planosFechados, setPlanosFechados] = useState<Set<string>>(new Set());
  const [equipesAbertas, setEquipesAbertas] = useState<Set<number>>(new Set());
  const [excluindo, setExcluindo] = useState<EquipeParaExcluir | null>(null);
  const [acoesDe, setAcoesDe] = useState<ParticipanteNoPlano | null>(null);

  const todasEquipes = useMemo(() => dados.planos.flatMap((p) => p.equipes), [dados]);
  // Busca por participante: abre as equipes em que ele aparece (o contexto do plano continua visível).
  const comCorrespondencia = useMemo(
    () =>
      todasEquipes
        .filter((e) => e.participantes.some((p) => p.corresponde_busca))
        .map((e) => e.id)
        .join(","),
    [todasEquipes],
  );
  useEffect(() => {
    if (buscaParticipante && comCorrespondencia) setEquipesAbertas(new Set(comCorrespondencia.split(",").map(Number)));
  }, [buscaParticipante, comCorrespondencia]);

  const alternarPlano = (k: string) =>
    setPlanosFechados((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const alternarEquipe = (id: number) =>
    setEquipesAbertas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className={estilos.arvoreContainer}>
      <div className={estilos.barraArvore}>
        <p className={styles.meta} role="status">
          {plural(dados.planos.length, "plano", "planos")} · {plural(dados.total_equipes, "equipe", "equipes")} ·{" "}
          {plural(dados.total_pessoas, "pessoa", "pessoas")} (quem está em várias equipes conta uma vez)
        </p>
        <div className={estilos.botoesArvore}>
          <Button
            tamanho="sm"
            onClick={() => {
              setPlanosFechados(new Set());
              setEquipesAbertas(new Set(todasEquipes.map((e) => e.id)));
            }}
          >
            Expandir tudo
          </Button>
          <Button
            tamanho="sm"
            onClick={() => {
              setPlanosFechados(new Set(dados.planos.map(chavePlano)));
              setEquipesAbertas(new Set());
            }}
          >
            Recolher tudo
          </Button>
        </div>
      </div>
      {dados.truncado && (
        <p className={estilos.aviso} role="status">
          Há mais equipes do que a árvore mostra de uma vez. Use os filtros para refinar.
        </p>
      )}
      {situacao.error && <p className={styles.erro}>{situacao.error.message}</p>}

      <ul className={estilos.arvore} aria-label="Equipes por plano de ação">
        {dados.planos.map((p) => {
          const k = chavePlano(p);
          const aberto = !planosFechados.has(k);
          const idGrupo = `arvore-${k}`;
          const titulo = p.plano ? `${p.plano.codigo} — ${p.plano.nome}` : "Sem plano vinculado";
          return (
            <li key={k} className={estilos.noPlano}>
              <div className={estilos.linha}>
                <button
                  type="button"
                  className={estilos.alternar}
                  aria-expanded={aberto}
                  aria-controls={idGrupo}
                  aria-label={`${aberto ? "Recolher" : "Expandir"} plano ${titulo}`}
                  onClick={() => alternarPlano(k)}
                  onKeyDown={teclasExpandir(aberto, () => alternarPlano(k))}
                >
                  <Icon name={aberto ? "chevronDown" : "chevronRight"} size={16} />
                </button>
                <div className={estilos.conteudo}>
                  {p.plano ? (
                    <Link to={`/planos/${p.plano.id}`} className={estilos.tituloPlano}>
                      <span className={estilos.codigo}>{p.plano.codigo}</span> {p.plano.nome}
                    </Link>
                  ) : (
                    <span className={estilos.tituloPlano}>Sem plano vinculado</span>
                  )}
                  <span className={estilos.meta}>
                    {p.gestor && <>Gestor: {p.gestor.nome} · </>}
                    {p.area && <>{p.area.nome} · </>}
                    {plural(p.equipes.length, "equipe", "equipes")} · {plural(p.total_pessoas, "pessoa", "pessoas")}
                  </span>
                  {p.plano?.arquivado && (
                    <span className={estilos.selos}>
                      <Badge tom="neutro">Plano arquivado — somente consulta</Badge>
                    </span>
                  )}
                </div>
                {p.pode_criar_equipe && p.plano && (
                  <ButtonLink to={`/equipes/nova?plano_id=${p.plano.id}`} tamanho="sm" className={estilos.operacao}>
                    + Equipe
                  </ButtonLink>
                )}
              </div>
              {aberto && (
                <ul id={idGrupo} className={estilos.grupo} aria-label={`Equipes de ${titulo}`}>
                  {p.equipes.map((e) => (
                    <NoDaEquipe
                      key={e.id}
                      equipe={e}
                      plano={p}
                      aberta={equipesAbertas.has(e.id)}
                      onAlternar={() => alternarEquipe(e.id)}
                      onEditar={() => navigate(`/equipes/${e.id}/editar`)}
                      onSituacao={() => situacao.mutate({ id: e.id, ativo: !e.ativo })}
                      situacaoPendente={situacao.isPending}
                      onExcluir={() => setExcluindo({ id: e.id, nome: e.nome, plano: p.plano })}
                      onParticipante={(pt) =>
                        p.plano &&
                        setAcoesDe({
                          plano: p.plano,
                          usuarioId: pt.usuario_id,
                          nome: pt.nome,
                        })
                      }
                    />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <ModalExcluirEquipe equipe={excluindo} onFechar={() => setExcluindo(null)} />
      <ModalAcoesParticipante alvo={acoesDe} onFechar={() => setAcoesDe(null)} />
    </div>
  );
}

function NoDaEquipe({
  equipe: e,
  plano,
  aberta,
  onAlternar,
  onEditar,
  onSituacao,
  situacaoPendente,
  onExcluir,
  onParticipante,
}: {
  equipe: NoEquipe;
  plano: NoPlano;
  aberta: boolean;
  onAlternar: () => void;
  onEditar: () => void;
  onSituacao: () => void;
  situacaoPendente: boolean;
  onExcluir: () => void;
  onParticipante: (p: NoParticipante) => void;
}) {
  const idGrupo = `arvore-equipe-${e.id}`;
  return (
    <li className={estilos.noEquipe} data-inativo={e.ativo ? undefined : true}>
      <div className={estilos.linha}>
        <button
          type="button"
          className={estilos.alternar}
          aria-expanded={aberta}
          aria-controls={idGrupo}
          aria-label={`${aberta ? "Recolher" : "Expandir"} equipe ${e.nome}`}
          onClick={onAlternar}
          onKeyDown={teclasExpandir(aberta, onAlternar)}
        >
          <Icon name={aberta ? "chevronDown" : "chevronRight"} size={16} />
        </button>
        <div className={estilos.conteudo}>
          <Link to={`/equipes/${e.id}`} className={estilos.tituloEquipe}>
            {e.nome}
          </Link>
          {resumir(e.descricao) && <span className={estilos.descricao}>{resumir(e.descricao)}</span>}
          <span className={estilos.meta}>
            {plural(e.total_participantes, "participante", "participantes")}
            {!plano.plano && <> · {e.area.nome}</>}
          </span>
          {/* Plano arquivado / sem plano já aparecem no nível do plano. */}
          <span className={estilos.selos}>
            <Badge tom={e.ativo ? "sucesso" : "neutro"}>{e.ativo ? "Ativa" : "Inativa"}</Badge>
          </span>
        </div>
        {e.pode_gerenciar && (
          <span className={estilos.operacao}>
            <DropdownMenu
              rotulo={<Icon name="more" size={16} strokeWidth={2.6} />}
              ariaLabel={`Operações: ${e.nome}`}
              classeBotao={classesDoBotao({ variante: "icone", tamanho: "sm" })}
            >
              {(fechar) => (
                <>
                  <DropdownItem onClick={() => (fechar(), onEditar())}>Editar</DropdownItem>
                  <DropdownItem disabled={situacaoPendente} onClick={() => (fechar(), onSituacao())}>
                    {e.ativo ? "Inativar" : "Ativar"}
                  </DropdownItem>
                  <DropdownItem perigo onClick={() => (fechar(), onExcluir())}>
                    Excluir
                  </DropdownItem>
                </>
              )}
            </DropdownMenu>
          </span>
        )}
      </div>
      {aberta && (
        <ul id={idGrupo} className={estilos.composicao} aria-label={`Composição de ${e.nome}`}>
          {e.participantes.length === 0 && <li className={styles.meta}>Nenhum participante.</li>}
          {ordenar(e.participantes).map((pt) => {
            const conteudo = (
              <>
                <span className={estilos.nomePessoa}>
                  {pt.corresponde_busca ? <mark className={estilos.destaque}>{pt.nome}</mark> : pt.nome}
                  {pt.coordenador && <Badge tom="primaria">Coordenador</Badge>}
                  {!pt.ativo && <span className={styles.meta}>conta inativa</span>}
                </span>
                <span className={estilos.funcao}>{pt.funcao_cargo ?? "Sem função/cargo"}</span>
              </>
            );
            return (
              <li key={pt.usuario_id} className={pt.coordenador ? `${estilos.pessoa} ${estilos.coordenador}` : estilos.pessoa}>
                {plano.plano ? (
                  <button
                    type="button"
                    className={estilos.botaoPessoa}
                    aria-haspopup="dialog"
                    aria-label={`${pt.nome}${pt.coordenador ? ", coordenador" : ""}: ver as ações atribuídas no plano ${plano.plano.codigo}`}
                    onClick={() => onParticipante(pt)}
                  >
                    {conteudo}
                  </button>
                ) : (
                  <span className={estilos.botaoPessoa}>{conteudo}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
