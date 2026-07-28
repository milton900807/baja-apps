function () {

    class PolymerNotation {

        polymerID;
        annotation;
        annotationHere = false;

        polymerElements = null;

        mapOfMonomers = {};

        mapIntraConnection = {}
        constructor(str) {

            polymerID = this.ValidationMethod.decideWhichEntity(str);
            setPolymerElements();
        }

        setPolymerElements() {
            if (polymerID instanceof RNAEntity || polymerID instanceof PeptideEntity) {
                this.polymerElements = new PolymerListElements(polymerID);
            } else {
                this.polymerElements = new PolymerSingleElements(polymerID);
            }

        }
        setAnnotation(str) {
            this.annotation = str;
            if (str != null) {
                this.annotationHere = true;
            }
        }
        getPolymerID() {
            return this.polymerID;
        }
        getPolymerElements() {
            return this.polymerElements;
        }
        getAnnotation() {
            return this.annotation;
        }
        isAnnotationHere() {
            return this.annotationHere;
        }
        toString() {
            if (isAnnotationHere()) {
                return "PolymerID: " + polymerID + "\nElements: " + this.polymerElements.toString() + "Annotation: " + annotation;
            } else {
                return "PolymerID: " + polymerID + "\nElements: " + this.polymerElements.toString();
            }

        }
        toHELM2() {
            return this.polymerElements.toHELM2();
        }
        toHELM() {
            if (polymerID instanceof BlobEntity) {
                throw new HELM1ConverterException("Can't be downgraded to HELM1-Format");
            }
            return this.polymerElements.toHELM();
        }

         getMonomerNotation(count) {
            initializeMapOfMonomersAndMapOfIntraConnection();

            if (mapOfMonomers.containsKey(count)) {
                return mapOfMonomers.get(count);
            }
            return null;
        }

        initializeMapOfMonomersAndMapOfIntraConnection() {
            multiply = 1;
            value = 0;
            lastValue = -1;

            for (let element : this.polymerElements.getListOfElements()) {
                try {

                    multiply = 1;
                    if (multiply < 1) {
                        multiply = 1;
                    }
                } catch (NumberFormatException ex) {
                    multiply = 1;
                }

                if (element instanceof MonomerNotationUnitRNA) {
                    for (int z = 0; z < multiply; z++) {
                        lastValue = value;
                        for (MonomerNotationUnit monomerNotationUnit : ((MonomerNotationUnitRNA) element).getContents()) {
                            value++;
                            mapOfMonomers.put(value, monomerNotationUnit);
                        }

                        if (value >= 4) {
                            mapIntraConnection.put(lastValue + "$R2", "");
                            int val = lastValue + 1;
                            mapIntraConnection.put(val + "$R1", "");
                        }
                    }

                } else {
                    for (int z = 0; z < multiply; z++) {
                        value++;
                        lastValue++;
                        mapOfMonomers.put(value, element);
                        if (lastValue != 0) {
                            mapIntraConnection.put(lastValue + "$R2", "");
                            mapIntraConnection.put(value + "$R1", "");
                        }
                    }

                }
            }
        }

        @JsonIgnore
        public Map<String, String> getMapIntraConnection() {
            return mapIntraConnection;
        }

        @JsonIgnore
        public List<MonomerNotation> getListMonomers() {
            List < MonomerNotation > listMonomerNotation = new ArrayList<MonomerNotation>();
            for (MonomerNotation monomerNotation : polymerElements.getListOfElements()) {
                if (monomerNotation instanceof MonomerNotationUnit) {
                    listMonomerNotation.add(monomerNotation);
                } else {
                    if (monomerNotation instanceof MonomerNotationGroup) {
                        for (MonomerNotationGroupElement groupElement : ((MonomerNotationGroup) monomerNotation).getListOfElements()) {
                            listMonomerNotation.add(groupElement.getMonomerNotation());
                        }
                    }
                    if (monomerNotation instanceof MonomerNotationList) {
                        listMonomerNotation.addAll(((MonomerNotationList) monomerNotation).getListofMonomerUnits());
                    }
                }
            }
            return listMonomerNotation;
        }

    }

    class BuilderMolecule {

        static buildMoleculefromSinglePolymer(polymernotation) {

            if (polymernotation.getPolymerID() instanceof BlobEntity) {
                throw new BuilderMoleculeException("Molecule can't be build for BLOB");
            }
            else if (polymernotation.getPolymerID() instanceof ChemEntity) {

                let validMonomers = MethodsMonomerUtils.getListOfHandledMonomers(polymernotation.getPolymerElements().getListOfElements());
                return buildMoleculefromCHEM(polymernotation.getPolymerID().getId(), validMonomers);
            }  else if (polymernotation.getPolymerID() instanceof RNAEntity
                || polymernotation.getPolymerID() instanceof PeptideEntity) {

                let validMonomers = MethodsMonomerUtils.getListOfHandledMonomers(polymernotation.getPolymerElements().getListOfElements());
                return buildMoleculefromPeptideOrRNA(polymernotation.getPolymerID().getId(), validMonomers);
            } else {
                throw new BuilderMoleculeException("Molecule can't be build for unknown polymer type");
            }
        }
    }
}
