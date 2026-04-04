import copy
import os
import shutil
import sys
import zipfile
from datetime import datetime
from pathlib import Path
from xml.etree import ElementTree as ET


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
XML_NS = "http://www.w3.org/XML/1998/namespace"
NS = {"w": W_NS}

ET.register_namespace("w", W_NS)


def qn(tag):
    prefix, local = tag.split(":")
    if prefix != "w":
        raise ValueError(f"Unsupported namespace prefix: {prefix}")
    return f"{{{W_NS}}}{local}"


def get_body(root):
    body = root.find("w:body", NS)
    if body is None:
        raise RuntimeError("word/document.xml is missing w:body")
    return body


def get_paragraph_text(paragraph):
    texts = []
    for text_node in paragraph.findall(".//w:t", NS):
        texts.append(text_node.text or "")
    return "".join(texts).strip()


def get_first_run_properties(paragraph):
    run = paragraph.find("w:r", NS)
    if run is None:
        return None
    run_props = run.find("w:rPr", NS)
    return copy.deepcopy(run_props) if run_props is not None else None


def make_text_run(text, run_props=None):
    run = ET.Element(qn("w:r"))
    if run_props is not None:
        run.append(copy.deepcopy(run_props))
    text_node = ET.SubElement(run, qn("w:t"))
    if text != text.strip() or "  " in text:
        text_node.set(f"{{{XML_NS}}}space", "preserve")
    text_node.text = text
    return run


def replace_paragraph_text(paragraph, text):
    paragraph_props = paragraph.find(qn("w:pPr"))
    run_props = get_first_run_properties(paragraph)

    for child in list(paragraph):
        if paragraph_props is not None and child is paragraph_props:
            continue
        paragraph.remove(child)

    paragraph.append(make_text_run(text, run_props))


def make_paragraph_like(template_paragraph, text):
    paragraph = ET.Element(qn("w:p"))
    paragraph_props = template_paragraph.find(qn("w:pPr"))
    if paragraph_props is not None:
        paragraph.append(copy.deepcopy(paragraph_props))
    paragraph.append(make_text_run(text, get_first_run_properties(template_paragraph)))
    return paragraph


def find_paragraph(body, text):
    for paragraph in body.findall("w:p", NS):
        if get_paragraph_text(paragraph) == text:
            return paragraph
    return None


def ensure_replacement(body, original, updated):
    paragraph = find_paragraph(body, updated)
    if paragraph is not None:
        return

    paragraph = find_paragraph(body, original)
    if paragraph is None:
        raise RuntimeError(f"Could not find paragraph to replace:\n{original}")
    replace_paragraph_text(paragraph, updated)


def ensure_insert_after(body, anchor_text, new_texts):
    if not new_texts:
        return

    existing_texts = {get_paragraph_text(paragraph) for paragraph in body.findall("w:p", NS)}
    anchor = find_paragraph(body, anchor_text)
    if anchor is None:
        raise RuntimeError(f"Could not find anchor paragraph:\n{anchor_text}")

    insert_at = list(body).index(anchor) + 1
    template = anchor
    for text in new_texts:
        if text in existing_texts:
            continue
        new_paragraph = make_paragraph_like(template, text)
        body.insert(insert_at, new_paragraph)
        insert_at += 1
        template = new_paragraph
        existing_texts.add(text)


def update_document_xml_bytes(xml_bytes):
    root = ET.fromstring(xml_bytes)
    tree = ET.ElementTree(root)
    root = tree.getroot()
    body = get_body(root)

    replacements = {
        "This innovation presents a mobile application (for customers and station officers) and a web-based platform (for station managers) designed for fuel station discovery and digital queue management, with the objective of optimizing fuel access and reducing congestion. The system integrates real-time geolocation, queue monitoring, digital payment, electronic ticketing, and smart notification technologies into a unified platform.": "This innovation presents a mobile application (for customers and station officers) and a web-based platform (for station managers) designed for fuel station discovery, electric charging station discovery, and digital queue management, with the objective of optimizing access to fuel and EV charging while reducing congestion. The system integrates real-time geolocation, queue monitoring, charger and fuel availability visibility, digital payment, electronic ticketing, and smart notification technologies into a unified platform.",
        "Users can securely register and authenticate, after which nearby fuel stations are identified using GPS-based location services. The platform provides dynamic information including queue length, estimated waiting time, service capacity, distance, and navigation guidance. Users are able to remotely select a fuel station, join or reserve a queue position, and complete advance payment through integrated digital payment methods. Upon successful transaction, the system generates a unique digital access ticket, incorporating a QR code and one-time password (OTP) for secure verification at the fuel station": "Users can securely register and authenticate, after which nearby fuel stations or electric charging stations are identified using GPS-based location services. The platform provides dynamic information including queue length, estimated waiting time, service capacity, distance, navigation guidance, station type, and charging-related categories for electric stations. Users are able to remotely select a station, join or reserve a queue position or charging access slot, and complete advance payment through integrated digital payment methods.",
        ".": "Upon successful transaction, the system generates a unique digital access ticket incorporating a QR code and one-time password (OTP) for secure verification at the selected station, while operators monitor fuel service or charging service readiness through connected mobile and web interfaces.",
        "In summary, the background of FuelFinder is the need to solve a real and costly coordination problem around fuel station access. The app was created to help customers find trustworthy station information quickly, reduce wasted travel and queue uncertainty, support digital reservation and payment, and improve the way stations manage service flow. Over time, it developed into a multi-role platform that combines customer mobility features with backend operational control, localized market relevance, and station management workflows. For that reason, FuelFinder should be understood not merely as a fuel station finder, but as a comprehensive digital system for fuel access, queue management, and station operations.": "In summary, the background of FuelFinder is the need to solve a real and costly coordination problem around fuel station access and, increasingly, electric vehicle charging access. The app was created to help customers find trustworthy station information quickly, reduce wasted travel and queue uncertainty, support digital reservation and payment, and improve the way stations manage service flow. Over time, it developed into a multi-role platform that combines customer mobility features with backend operational control, localized market relevance, and management workflows for both fuel stations and electric charging stations. For that reason, FuelFinder should be understood not merely as a fuel station finder, but as a comprehensive digital system for fuel access, EV charging discovery, queue management, and station operations.",
        "The invention is a computer-implemented fuel station discovery and queue management system designed specifically for Ethiopia. It integrates:": "The invention is a computer-implemented fuel station and electric charging station discovery and service-access management system designed specifically for Ethiopia. It integrates:",
        "Real-time fuel station information.": "Real-time fuel and electric station information.",
        "Digital queue management that reduces reliance on physical queues.": "Digital queue management and charging-access coordination that reduce reliance on physical queues.",
        "Notifications about queue and fuel status.": "Notifications about queue status, fuel status, and charger readiness.",
        "Customers use the mobile app to find nearby stations via GPS geolocation.": "Customers use the mobile app to find nearby fuel stations or electric charging stations via GPS geolocation.",
        "Queue length, estimated waiting time, fuel availability, and distance are displayed.": "Queue length, estimated waiting time, fuel availability or charger readiness, and distance are displayed.",
        "Customers can reserve a queue position remotely and pay in advance through secure digital payment.": "Customers can reserve a queue position or charging access slot remotely and pay in advance through secure digital payment.",
        "Officers validate tickets by scanning QR codes and manage queue flow digitally.": "Officers validate tickets by scanning QR codes and manage queue flow or charging-access flow digitally.",
        "Managers monitor all stations in real time, track fuel stock, and generate reports.": "Managers monitor all stations in real time, track fuel stock or charging availability, and generate reports.",
        "Customers receive real-time notifications for fuel availability, queue updates, and arrival reminders.": "Customers receive real-time notifications for fuel availability, charger readiness, queue updates, and arrival reminders.",
        "This system reduces congestion, eliminates uncertainty, and improves efficiency while maintaining coordination among all participants.": "This system reduces congestion, eliminates uncertainty, and improves efficiency while maintaining coordination among all participants across fuel distribution and EV charging services.",
        "GPS-based Fuel Station Discovery – Customers can see all nearby stations, current queue length, estimated waiting times, service capacity, and distance.": "GPS-based Station Discovery – Customers can see nearby fuel stations or electric charging stations, current queue length, estimated waiting times, service capacity, distance, and navigation guidance.",
        "Digital Queue and Ticketing – Customers can reserve a queue position and pay in advance. Digital tickets contain QR codes and OTPs for secure verification.": "Digital Queue, Charging-Access, and Ticketing – Customers can reserve a queue position or charging access slot and pay in advance. Digital tickets contain QR codes and OTPs for secure verification.",
        "Update fuel availability.": "Update fuel availability or charging-service readiness.",
        "Track fuel consumption and availability,": "Track fuel consumption, charger availability, and station readiness,",
        "Generate operational and financial reports including daily fuel sold and revenue.": "Generate operational and financial reports including daily fuel sold, reservation activity, and service throughput.",
        "Integration – Combines station discovery, queue management, payment processing, ticket verification, notifications, and administrative monitoring into a unified platform.": "Integration – Combines station discovery, queue management, payment processing, ticket verification, notifications, routing, and administrative monitoring into a unified platform.",
        "Adaptation for Ethiopia – Specifically designed for high-demand, limited-supply fuel stations, handling physical queues and digital reservations simultaneously.": "Adaptation for Ethiopia – Specifically designed for high-demand, limited-supply fuel stations and emerging EV charging networks, handling physical queues and digital reservations simultaneously.",
        "A computer-implemented fuel station discovery and queue management system, comprising:": "A computer-implemented station discovery and service-access management system for fuel stations and electric charging stations, comprising:",
        "A web-based platform for station managers,configured to provide real-time fuel station information, queue management services, and coordinated interaction among all parties, including digital and physical queues.": "A web-based platform for station managers, configured to provide real-time fuel and charging station information, queue management services, charging-access coordination, and coordinated interaction among all parties, including digital and physical queues.",
        "The system of Claim 1, wherein it utilizes GPS-based geolocation to identify nearby fuel stations and display dynamic data including queue length, estimated waiting time, service capacity, and distance, allowing customers to select stations efficiently.": "The system of Claim 1, wherein it utilizes GPS-based geolocation to identify nearby fuel stations or electric charging stations and display dynamic data including queue length, estimated waiting time, service capacity, distance, navigation guidance, and station type, allowing customers to select stations efficiently.",
        "The system of Claim 1, wherein customers can securely register, authenticate, select a fuel station, join or reserve a queue, and pay digitally, generating a secure ticket with a unique QR code and OTP.": "The system of Claim 1, wherein customers can securely register, authenticate, choose a preferred station type, select a fuel station or electric charging station, join or reserve a queue or charging access slot, and pay digitally, generating a secure ticket with a unique QR code and OTP.",
        "The system of Claim 1, wherein real-time notifications and queue updates are sent to users, including fuel availability alerts, estimated waiting times, and arrival reminders.": "The system of Claim 1, wherein electric charging stations are classified and searchable according to charging-related attributes including connector or socket type, charging access condition, and paid or free charging status.",
        "The system of Claim 1, wherein station officers use a mobile interface to validate tickets, monitor arrivals, manage queue flow, and update fuel availability in real time.": "The system of Claim 1, wherein real-time notifications and queue updates are sent to users, including fuel availability alerts, charger readiness updates, estimated waiting times, and arrival reminders.",
        "The system of Claim 1, wherein station managers use a web-based platform to monitor overall station performance, queue statistics, fuel consumption, user and officer accounts, and generate operational and financial reports including daily fuel sold and revenue.": "The system of Claim 1, wherein station officers use a mobile interface to validate tickets, monitor arrivals, manage queue flow, and update fuel availability or charging-station service readiness in real time.",
        "The system of Claim 1, wherein the integration of queue management, digital payment, ticket verification, notifications, and administrative monitoring forms a unified platform that improves efficiency, reduces congestion, handles both physical and digital queues, and addresses fuel distribution challenges in high-demand, limited-supply environments, specifically adapted for Ethiopia.": "The system of Claim 1, wherein station managers use a web-based platform to monitor overall fuel and electric station performance, queue statistics, fuel inventory or charger availability, user and officer accounts, and operational and financial reports, such that station discovery, queue management, payment processing, ticket verification, notifications, routing, and administrative monitoring operate as a unified platform adapted for Ethiopia.",
    }

    for original, updated in replacements.items():
        ensure_replacement(body, original, updated)

    insertions = {
        "Administrative monitoring and reporting.": [
            "In embodiments supporting electric mobility, users can choose a preferred station type so the application presents a matching fuel-station or electric-station discovery workflow and filtered results."
        ],
        "Arrival reminders when the customer’s turn is approaching.": [
            "Electric Charging Station Support – The platform can store and surface electric charging stations using station-type filters, charger-readiness indicators, and charging-location categories.",
            "Charging Station Classification – Electric charging stations can be categorized by connector or socket type, including Type 2, CCS or CCS2, CHAdeMO, Tesla, and Schuko, as well as by free or paid charging and customer or private access conditions."
        ]
    }

    for anchor_text, texts in insertions.items():
        ensure_insert_after(body, anchor_text, texts)

    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def create_backup_path(docx_path):
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return docx_path.with_name(f"{docx_path.stem}.backup-{stamp}{docx_path.suffix}")


def rewrite_docx(docx_path):
    docx_path = Path(docx_path)
    if not docx_path.exists():
        raise FileNotFoundError(f"Document not found: {docx_path}")

    backup_path = create_backup_path(docx_path)
    temp_parent = Path.cwd() / ".tmp-patent-docx"
    temp_parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(docx_path, "r") as source_archive:
        members = [info.filename for info in source_archive.infolist()]
        contents = {name: source_archive.read(name) for name in members}

    if "word/document.xml" not in contents:
        raise RuntimeError("Could not find word/document.xml inside the .docx file")

    contents["word/document.xml"] = update_document_xml_bytes(contents["word/document.xml"])

    shutil.copy2(docx_path, backup_path)

    rebuilt_path = temp_parent / f"{docx_path.stem}.updated{docx_path.suffix}"
    with zipfile.ZipFile(rebuilt_path, "w", compression=zipfile.ZIP_DEFLATED) as target_archive:
        for name in members:
            target_archive.writestr(name, contents[name])

    shutil.copy2(rebuilt_path, docx_path)
    rebuilt_path.unlink(missing_ok=True)

    return backup_path


def main():
    if len(sys.argv) != 2:
        print("Usage: python update_patent_docx.py <path-to-docx>")
        raise SystemExit(2)

    docx_path = Path(sys.argv[1])
    backup_path = rewrite_docx(docx_path)
    print(f"Updated: {docx_path}")
    print(f"Backup: {backup_path}")


if __name__ == "__main__":
    main()
