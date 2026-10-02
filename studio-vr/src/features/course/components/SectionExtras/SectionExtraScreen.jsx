function SectionExtraScreen({ extra, sectionTitle, onBack }) {
  return (
    <section className="section-extra-screen" aria-label={`${extra.label}: ${sectionTitle}`}>
      <button type="button" className="section-extra-screen__back" onClick={onBack}>
        ← Back to section
      </button>
      <div className="lesson-kicker">{extra.label}</div>
      <h2 className="lesson-title">{sectionTitle}</h2>
      <div className="section-extra-screen__empty">{extra.empty}</div>
    </section>
  );
}

export default SectionExtraScreen;
